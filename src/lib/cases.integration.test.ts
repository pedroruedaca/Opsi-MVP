// Runs against a real Postgres when TEST_DATABASE_URL is set (skipped otherwise), e.g.
// TEST_DATABASE_URL=postgres://opsi:opsi@localhost:5432/opsi_test npm test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('cases (Postgres)', () => {
  let mod: typeof import('./cases');
  let dbMod: typeof import('@/db');

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = (await import('postgres')).default;
    const client = postgres(url!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    await client.end();
    dbMod = await import('@/db');
    mod = await import('./cases');
  });
  afterAll(async () => { await dbMod?.db.$client.end(); });

  it('creates a case, stores a PDF with its hash, rejects duplicates and records events', async () => {
    const row = await mod.createCase({ borrowerName: 'Prueba S.L.', nif: 'B11111111', requestedAmount: null });
    const bytes = new TextEncoder().encode('%PDF-1.4\n' + crypto.randomUUID());
    const doc = await mod.addDocument(row.id, { type: 'modelo_303', period: '2025-Q1', filename: 'q1.pdf', bytes });
    expect(doc.extractionStatus).toBe('pending');
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);

    await expect(mod.addDocument(row.id, { type: 'modelo_303', period: '2025-Q2', filename: 'copy.pdf', bytes }))
      .rejects.toThrow(/ya se ha subido/);

    const full = await mod.getCase(row.id);
    expect(full?.documents).toHaveLength(1);
    expect(full?.events.map(e => e.type)).toEqual(['case.created', 'document.uploaded']);
    expect(full?.events[1]?.payload).toMatchObject({ sha256: doc.sha256, filename: 'q1.pdf' });

    const { readStoredFile } = await import('./storage');
    expect(await readStoredFile(doc.blobUrl)).toEqual(bytes);
  });

  it('extracts a sample from its fixture, then drives review to a confirmed document', async () => {
    const { readFile } = await import('node:fs/promises');
    const { runExtraction, reviewField } = await import('./review');
    const row = await mod.createCase({ borrowerName: 'Revisión S.L.', nif: 'B00000000', requestedAmount: null });
    const bytes = new Uint8Array(await readFile('samples/modelo-303_2025_2T.pdf'));
    const doc = await mod.addDocument(row.id, { type: 'modelo_303', period: '2025-Q2', filename: 'q2.pdf', bytes });

    const neverCalled = async () => { throw new Error('live extractor must not run for a cached sample'); };
    // Two concurrent triggers: only one may claim the document.
    await Promise.all([runExtraction(doc.id, neverCalled), runExtraction(doc.id, neverCalled)]);

    let full = await mod.getCase(row.id);
    expect(full?.status).toBe('in_review');
    expect(full?.documents[0]).toMatchObject({ extractionStatus: 'needs_review', extractionSource: 'cached' });
    expect(full?.events.filter(e => e.type === 'document.extraction_started')).toHaveLength(1);

    const { db, schema } = dbMod;
    const { eq } = await import('drizzle-orm');
    const fields = await db.select().from(schema.fields).where(eq(schema.fields.documentId, doc.id));
    expect(fields).toHaveLength(15);
    const base21 = fields.find(f => f.key === 'base_21')!;
    expect(base21).toMatchObject({ extractedValue: '310000.00', page: 1 });

    await expect(reviewField(base21.id, { action: 'correct', value: '310.500,00', reason: '' })).rejects.toThrow(/motivo/);
    await expect(reviewField(base21.id, { action: 'clear' })).rejects.toThrow(/descartas/);
    const corrected = await reviewField(base21.id, { action: 'correct', value: '310.500,00', reason: 'Error de lectura' });
    expect(corrected).toMatchObject({ status: 'corrected', confirmedValue: '310500.00' });

    for (const f of fields.filter(f => f.id !== base21.id)) await reviewField(f.id, { action: 'confirm' });
    full = await mod.getCase(row.id);
    expect(full?.documents[0]?.extractionStatus).toBe('confirmed');
    expect(full?.events.filter(e => e.type === 'document.confirmed')).toHaveLength(1);
  });

  it('uses the live extractor for unknown files and records failures for retry', async () => {
    const { runExtraction } = await import('./review');
    const { ExtractionError } = await import('./extraction');
    const row = await mod.createCase({ borrowerName: 'Real S.L.', nif: 'B33333333', requestedAmount: null });
    const bytes = new TextEncoder().encode('%PDF-1.4\n' + crypto.randomUUID());
    const doc = await mod.addDocument(row.id, { type: 'annual_accounts', period: '2025', filename: 'real.pdf', bytes });

    await runExtraction(doc.id, async () => { throw new ExtractionError('Servicio caído', 'provider'); });
    let full = await mod.getCase(row.id);
    expect(full?.documents[0]).toMatchObject({ extractionStatus: 'failed', extractionError: 'Servicio caído' });

    await runExtraction(doc.id, async () => ({ model: 'claude-opus-5', fields: [{ key: 'revenue', value: '1000.00', page: 2, quote: 'Cifra de negocios 1.000,00' }] }));
    full = await mod.getCase(row.id);
    expect(full?.documents[0]).toMatchObject({ extractionStatus: 'needs_review', extractionSource: 'model', extractionModel: 'claude-opus-5' });
  });
});
