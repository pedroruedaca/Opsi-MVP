// Creates the demo case from the synthetic PDFs in samples/. Safe to re-run: skips if the case exists.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { borrower, vatQuarters, vatYear, annualAccounts } from './sample-data';

const { db, schema } = await import('../src/db');
const { addDocument, createCase } = await import('../src/lib/cases');
const { runExtraction } = await import('../src/lib/review');

const [existing] = await db.select().from(schema.cases).where(eq(schema.cases.nif, borrower.nif));
if (existing) {
  console.log(`Demo case already exists: /cases/${existing.id}`);
  process.exit(0);
}

const row = await createCase({ borrowerName: borrower.name, nif: borrower.nif, requestedAmount: borrower.requestedAmount });
const files = [
  ...vatQuarters.map(q => ({ file: `modelo-303_${vatYear}_${q.quarter}T.pdf`, type: 'modelo_303' as const, period: `${vatYear}-Q${q.quarter}` })),
  { file: `cuentas-anuales_${annualAccounts.year}.pdf`, type: 'annual_accounts' as const, period: String(annualAccounts.year) },
];
for (const f of files) {
  const bytes = new Uint8Array(await readFile(path.join(process.cwd(), 'samples', f.file)));
  const doc = await addDocument(row.id, { type: f.type, period: f.period, filename: f.file, bytes });
  // Sample files match stored fixtures, so this uses the cached extraction (no API call).
  await runExtraction(doc.id);
  console.log(`  + ${f.file}`);
}
console.log(`Demo case created: /cases/${row.id}`);
process.exit(0);
