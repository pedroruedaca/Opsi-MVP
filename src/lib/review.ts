import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sampleExtractions } from '@/fixtures/extractions';
import { recordEvent } from './cases';
import type { DocumentType } from './documents';
import { ExtractionError, extractWithClaude, validateExtraction, type ExtractionResult } from './extraction';
import { canonicalValue, fieldDefs } from './fields';
import { readStoredFile } from './storage';

const { cases, documents, fields } = schema;

const STALE_EXTRACTION_MS = 5 * 60 * 1000;

type Extractor = (type: DocumentType, pdf: Uint8Array) => Promise<ExtractionResult>;

// Known sample files use their stored fixture so the demo works without the API; anything else goes to Claude.
async function extract(type: DocumentType, sha256: string, pdf: Uint8Array, live: Extractor) {
  const cached = sampleExtractions[sha256];
  if (cached && cached.documentType === type) {
    const fields = validateExtraction(type, { isExpectedDocument: true, documentCheckReason: '', fields: cached.fields });
    return { fields, model: null, source: 'cached' as const };
  }
  const result = await live(type, pdf);
  return { fields: result.fields, model: result.model, source: 'model' as const };
}

export async function runExtraction(documentId: string, live: Extractor = extractWithClaude): Promise<void> {
  // Claim the document atomically so concurrent triggers (upload + retry click) extract it only once.
  const staleBefore = new Date(Date.now() - STALE_EXTRACTION_MS);
  const [doc] = await db.update(documents)
    .set({ extractionStatus: 'extracting', extractionStartedAt: new Date(), extractionError: null })
    .where(and(eq(documents.id, documentId), or(
      inArray(documents.extractionStatus, ['pending', 'failed']),
      and(eq(documents.extractionStatus, 'extracting'), lt(documents.extractionStartedAt, staleBefore)),
    )))
    .returning();
  if (!doc) return;
  await recordEvent(db, doc.caseId, 'document.extraction_started', { documentId: doc.id, filename: doc.filename });

  try {
    const pdf = await readStoredFile(doc.blobUrl);
    if (!pdf) throw new ExtractionError('No se encuentra el archivo almacenado.', 'provider');
    const result = await extract(doc.type, doc.sha256, pdf, live);
    const found = new Map(result.fields.map(f => [f.key, f]));
    await db.transaction(async tx => {
      await tx.delete(fields).where(eq(fields.documentId, doc.id));
      // One row per defined field, so every field needs an explicit decision, including those not found.
      await tx.insert(fields).values(fieldDefs[doc.type].map(def => {
        const f = found.get(def.key);
        return { documentId: doc.id, key: def.key, extractedValue: f?.value ?? null, page: f?.page ?? null, quote: f?.quote ?? null };
      }));
      await tx.update(documents).set({
        extractionStatus: 'needs_review', extractionSource: result.source, extractionModel: result.model, extractedAt: new Date(),
      }).where(eq(documents.id, doc.id));
      await tx.update(cases).set({ status: 'in_review' }).where(and(eq(cases.id, doc.caseId), eq(cases.status, 'draft')));
      await recordEvent(tx, doc.caseId, 'document.extraction_completed', {
        documentId: doc.id, filename: doc.filename, source: result.source, model: result.model,
        fieldsFound: found.size, fieldsDefined: fieldDefs[doc.type].length,
      });
    });
  } catch (error) {
    const message = error instanceof ExtractionError ? error.message : 'No se pudo completar la extracción. Reinténtalo.';
    if (!(error instanceof ExtractionError)) console.error('Extraction failed', error);
    await db.update(documents).set({ extractionStatus: 'failed', extractionError: message }).where(eq(documents.id, doc.id));
    await recordEvent(db, doc.caseId, 'document.extraction_failed', {
      documentId: doc.id, filename: doc.filename, error: message, code: error instanceof ExtractionError ? error.code : 'unknown',
    });
  }
}

export class ReviewError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export type ReviewAction =
  | { action: 'confirm' }
  | { action: 'correct'; value: string; reason: string }
  | { action: 'clear'; reason?: string };

export async function reviewField(fieldId: string, input: ReviewAction) {
  return db.transaction(async tx => {
    const [row] = await tx.select({ field: fields, doc: documents, caseStatus: cases.status })
      .from(fields).innerJoin(documents, eq(documents.id, fields.documentId)).innerJoin(cases, eq(cases.id, documents.caseId))
      .where(eq(fields.id, fieldId)).for('update', { of: fields });
    if (!row) throw new ReviewError('Campo no encontrado.', 404);
    const { field, doc } = row;
    if (row.caseStatus === 'analysed' || row.caseStatus === 'decided') throw new ReviewError('El caso ya se ha analizado; los campos son de solo lectura.', 409);
    if (doc.extractionStatus !== 'needs_review' && doc.extractionStatus !== 'confirmed') throw new ReviewError('El documento no está en revisión.', 409);

    let update: Partial<typeof fields.$inferInsert>;
    if (input.action === 'confirm') {
      if (field.extractedValue === null) throw new ReviewError('No hay valor propuesto: corrígelo o déjalo vacío.');
      update = { status: 'confirmed', confirmedValue: field.extractedValue, correctionReason: null };
    } else if (input.action === 'correct') {
      const value = canonicalValue(doc.type, field.key, input.value);
      if (value === null) throw new ReviewError('Valor no válido para este campo.');
      const reason = input.reason.trim();
      if (!reason) throw new ReviewError('Indica el motivo de la corrección.');
      update = { status: 'corrected', confirmedValue: value, correctionReason: reason };
    } else {
      if (field.extractedValue !== null && !input.reason?.trim()) throw new ReviewError('Indica por qué descartas el valor propuesto.');
      update = { status: field.extractedValue === null ? 'confirmed' : 'corrected', confirmedValue: null, correctionReason: input.reason?.trim() || null };
    }
    const [saved] = await tx.update(fields).set({ ...update, reviewedAt: new Date() }).where(eq(fields.id, field.id)).returning();

    const [{ pending }] = await tx.select({ pending: sql<number>`count(*)::int` }).from(fields)
      .where(and(eq(fields.documentId, doc.id), sql`${fields.reviewedAt} is null`)) as [{ pending: number }];
    const nextStatus = pending === 0 ? 'confirmed' : 'needs_review';
    if (nextStatus !== doc.extractionStatus) await tx.update(documents).set({ extractionStatus: nextStatus }).where(eq(documents.id, doc.id));

    await recordEvent(tx, doc.caseId, `field.${input.action === 'confirm' ? 'confirmed' : input.action === 'correct' ? 'corrected' : 'left_empty'}`, {
      documentId: doc.id, fieldId: field.id, key: field.key, extractedValue: field.extractedValue,
      previousValue: field.reviewedAt ? field.confirmedValue : undefined, value: saved!.confirmedValue, reason: saved!.correctionReason,
    });
    if (nextStatus === 'confirmed' && doc.extractionStatus !== 'confirmed') {
      await recordEvent(tx, doc.caseId, 'document.confirmed', { documentId: doc.id, filename: doc.filename });
    }
    return saved!;
  });
}

export async function getFieldsForCase(caseId: string) {
  return db.select({ field: fields, documentId: documents.id }).from(fields)
    .innerJoin(documents, eq(documents.id, fields.documentId))
    .where(eq(documents.caseId, caseId)).orderBy(asc(fields.documentId));
}
