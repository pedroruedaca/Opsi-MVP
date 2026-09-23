import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { policy as currentPolicy, type Policy } from '@/policy/policy';
import { analyse, type AnalysisInput, type AnalysisOutput } from './analysis';
import { recordEvent } from './cases';
import { ReviewError } from './review';

const { analyses, cases, documents, fields } = schema;

export type StoredInputs = AnalysisInput & { policy: Policy };
export type AnalysisRow = Omit<typeof analyses.$inferSelect, 'inputs' | 'metrics' | 'checks' | 'ruleResults'> & {
  inputs: StoredInputs; metrics: AnalysisOutput['metrics']; checks: AnalysisOutput['checks']; ruleResults: AnalysisOutput['ruleResults'];
};

// Runs the deterministic analysis on the confirmed fields and stores a new, immutable analysis row
// with a snapshot of every input value and the full policy. Re-running always creates a new row.
export async function runAnalysis(caseId: string, p: Policy = currentPolicy) {
  return db.transaction(async tx => {
    const [c] = await tx.select().from(cases).where(eq(cases.id, caseId)).for('update');
    if (!c) throw new ReviewError('Caso no encontrado.', 404);
    if (c.status !== 'in_review') throw new ReviewError(c.status === 'draft' ? 'Aún no hay documentos revisados.' : 'El caso ya está analizado; reabre la revisión para volver a analizar.', 409);

    const docs = await tx.select().from(documents).where(eq(documents.caseId, caseId));
    if (!docs.length) throw new ReviewError('El caso no tiene documentos.', 409);
    const notReady = docs.filter(d => d.extractionStatus !== 'confirmed');
    if (notReady.length) throw new ReviewError(`Faltan documentos por revisar: ${notReady.map(d => d.filename).join(', ')}.`, 409);

    const rows = await tx.select().from(fields).where(inArray(fields.documentId, docs.map(d => d.id)));
    const input: AnalysisInput = {
      caseNif: c.nif,
      documents: docs.map(d => ({
        id: d.id, type: d.type, period: d.period, filename: d.filename, sha256: d.sha256,
        fields: Object.fromEntries(rows.filter(r => r.documentId === d.id).map(r => [r.key, { fieldId: r.id, value: r.confirmedValue }])),
      })),
    };
    const out = analyse(input, p);
    const [row] = await tx.insert(analyses).values({
      caseId, policyVersion: p.version, inputs: { ...input, policy: p } satisfies StoredInputs,
      metrics: out.metrics, checks: out.checks, ruleResults: out.ruleResults, recommendation: out.recommendation,
    }).returning();
    await tx.update(cases).set({ status: 'analysed' }).where(eq(cases.id, caseId));
    await recordEvent(tx, caseId, 'analysis.completed', {
      analysisId: row!.id, recommendation: out.recommendation, policyVersion: p.version,
      rules: { pass: out.ruleResults.filter(r => r.status === 'pass').length, fail: out.ruleResults.filter(r => r.status === 'fail').length, missing: out.ruleResults.filter(r => r.status === 'missing').length },
      checksNotPassed: out.checks.filter(ch => ch.status !== 'pass').length,
    });
    return row!;
  });
}

// Lets the analyst change fields after an analysis. The earlier analysis stays stored; a new run supersedes it.
export async function reopenReview(caseId: string, reason: string) {
  const why = reason.trim();
  if (!why) throw new ReviewError('Indica por qué reabres la revisión.');
  return db.transaction(async tx => {
    const [c] = await tx.update(cases).set({ status: 'in_review' })
      .where(and(eq(cases.id, caseId), eq(cases.status, 'analysed'))).returning();
    if (!c) throw new ReviewError('Solo se puede reabrir un caso analizado y sin decisión.', 409);
    await recordEvent(tx, caseId, 'case.review_reopened', { reason: why });
    return c;
  });
}

export async function listAnalyses(caseId: string): Promise<AnalysisRow[]> {
  return await db.select().from(analyses).where(eq(analyses.caseId, caseId)).orderBy(desc(analyses.createdAt)) as AnalysisRow[];
}
