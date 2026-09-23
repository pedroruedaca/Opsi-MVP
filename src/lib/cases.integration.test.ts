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
});
