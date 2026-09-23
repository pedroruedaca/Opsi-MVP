import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { UploadValidationError, safeFilename, sha256Hex, validatePdfUpload, type DocumentType } from './documents';
import { storeFile } from './storage';

const { cases, documents, events } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recordEvent(tx: Tx | typeof db, caseId: string, type: string, payload: Record<string, unknown> = {}) {
  await tx.insert(events).values({ caseId, type, payload });
}

export async function listCases() {
  const rows = await db
    .select({ id: cases.id, borrowerName: cases.borrowerName, nif: cases.nif, status: cases.status,
      createdAt: cases.createdAt, documentCount: count(documents.id) })
    .from(cases)
    .leftJoin(documents, eq(documents.caseId, cases.id))
    .groupBy(cases.id)
    .orderBy(desc(cases.createdAt));
  return rows;
}

export async function getCase(id: string) {
  const [row] = await db.select().from(cases).where(eq(cases.id, id));
  if (!row) return null;
  const docs = await db.select().from(documents).where(eq(documents.caseId, id))
    .orderBy(asc(documents.type), asc(documents.period), asc(documents.uploadedAt));
  const timeline = await db.select().from(events).where(eq(events.caseId, id)).orderBy(asc(events.createdAt));
  return { ...row, documents: docs, events: timeline };
}

export async function createCase(input: { borrowerName: string; nif: string; requestedAmount: string | null }) {
  return db.transaction(async tx => {
    const [row] = await tx.insert(cases).values(input).returning();
    if (!row) throw new Error('Case insert returned nothing.');
    await recordEvent(tx, row.id, 'case.created', { borrowerName: row.borrowerName, nif: row.nif, requestedAmount: row.requestedAmount });
    return row;
  });
}

export async function addDocument(caseId: string, input: { type: DocumentType; period: string; filename: string; bytes: Uint8Array }) {
  validatePdfUpload(input.filename, input.bytes);
  const filename = safeFilename(input.filename);
  const sha256 = await sha256Hex(input.bytes);
  const [existing] = await db.select({ id: documents.id }).from(documents)
    .where(and(eq(documents.caseId, caseId), eq(documents.sha256, sha256)));
  if (existing) throw new UploadValidationError('Este archivo ya se ha subido a este caso.');
  const blobUrl = await storeFile(`cases/${caseId}/${sha256}.pdf`, input.bytes, 'application/pdf');
  return db.transaction(async tx => {
    const [doc] = await tx.insert(documents).values({
      caseId, type: input.type, period: input.period, filename, blobUrl, sha256, sizeBytes: input.bytes.byteLength,
    }).returning();
    if (!doc) throw new Error('Document insert returned nothing.');
    await recordEvent(tx, caseId, 'document.uploaded', {
      documentId: doc.id, type: doc.type, period: doc.period, filename, sha256, sizeBytes: doc.sizeBytes,
    });
    return doc;
  });
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  return doc ?? null;
}
