// Builds the synthetic sample PDFs in samples/ from scripts/sample-data.ts.
// Run with `npm run samples`; the output is committed so the demo works offline.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPdf, PAGE, type PdfOp } from './lib/pdf';
import { annualAccounts, borrower, eurEs, vatAmount, vatQuarters, vatYear, type VatQuarter } from './sample-data';

const LEFT = 50;
const RIGHT = PAGE.width - 50;
const SYNTHETIC = 'DOCUMENTO SINTÉTICO DE DEMOSTRACIÓN — sin validez fiscal ni contable';

function header(ops: PdfOp[], title: string, subtitle: string): number {
  ops.push({ kind: 'text', x: LEFT, y: 800, text: SYNTHETIC, size: 8, bold: true });
  ops.push({ kind: 'text', x: LEFT, y: 776, text: title, size: 15, bold: true });
  ops.push({ kind: 'text', x: LEFT, y: 758, text: subtitle, size: 10 });
  ops.push({ kind: 'rule', x1: LEFT, x2: RIGHT, y: 748 });
  return 728;
}

// Fixture fields for the sample being built: what a correct extraction would return, with page and quote
// matching the PDF text exactly. Written to src/fixtures/extractions.ts keyed by the PDF's SHA-256.
type FixtureField = { key: string; value: string; page: number; quote: string };
let fixture: FixtureField[] = [];
let currentPage = 1;

const decimal = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toFixed(2);

function note(key: string, value: string, quote: string) {
  fixture.push({ key, value, page: currentPage, quote });
}

function row(ops: PdfOp[], y: number, label: string, amount: number | null, opts: { bold?: boolean; indent?: number; key?: string } = {}) {
  ops.push({ kind: 'text', x: LEFT + (opts.indent ?? 0), y, text: label, size: 10, bold: opts.bold });
  if (amount !== null) ops.push({ kind: 'text', x: RIGHT, y, text: eurEs(amount), size: 10, bold: opts.bold, align: 'right' });
  if (opts.key && amount !== null) note(opts.key, decimal(amount), `${label} ${eurEs(amount)}`);
}

// Casilla numbers as in src/lib/fields.ts (régimen general; see the source note there).
const CASILLA = { base: { 4: '01', 10: '04', 21: '07' }, cuota: { 4: '03', 10: '06', 21: '09' } } as const;

function modelo303(q: VatQuarter): Uint8Array {
  fixture = []; currentPage = 1;
  const ops: PdfOp[] = [];
  const periodLine = `Ejercicio ${vatYear} · Periodo ${q.quarter}T`;
  let y = header(ops, 'Modelo 303 — IVA. Autoliquidación', periodLine);
  note('fiscal_year', String(vatYear), periodLine);
  note('quarter', String(q.quarter), periodLine);
  for (const [label, value] of [['NIF', borrower.nif], ['Apellidos y nombre o razón social', borrower.name], ['Domicilio', borrower.address]] as const) {
    ops.push({ kind: 'text', x: LEFT, y, text: `${label}: ${value}`, size: 10 }); y -= 16;
  }
  note('nif', borrower.nif, `NIF: ${borrower.nif}`);
  y -= 10;
  ops.push({ kind: 'text', x: LEFT, y, text: 'IVA devengado — Régimen general', size: 11, bold: true }); y -= 20;
  let totalOutput = 0;
  for (const rate of [4, 10, 21] as const) {
    const base = q.output.find(o => o.rate === rate)?.base ?? 0;
    const quota = vatAmount(base, rate);
    totalOutput += quota;
    row(ops, y, `[${CASILLA.base[rate]}] Base imponible al ${rate} %`, base, { indent: 10, key: `base_${rate}` }); y -= 15;
    row(ops, y, `[${CASILLA.cuota[rate]}] Cuota al ${rate} %`, quota, { indent: 10, key: `cuota_${rate}` }); y -= 19;
  }
  row(ops, y, '[27] Total cuota devengada', totalOutput, { bold: true, key: 'total_devengado' }); y -= 28;

  ops.push({ kind: 'text', x: LEFT, y, text: 'IVA deducible', size: 11, bold: true }); y -= 20;
  const inputQuota = vatAmount(q.inputBase, 21);
  row(ops, y, '[28] Cuotas soportadas en operaciones interiores corrientes — base', q.inputBase, { indent: 10, key: 'base_deducible_corrientes' }); y -= 15;
  row(ops, y, '[29] Cuotas soportadas en operaciones interiores corrientes — cuota', inputQuota, { indent: 10, key: 'cuota_deducible_corrientes' }); y -= 19;
  row(ops, y, '[45] Total a deducir', inputQuota, { bold: true, key: 'total_deducir' }); y -= 28;

  ops.push({ kind: 'rule', x1: LEFT, x2: RIGHT, y: y + 12 });
  const result = Math.round((totalOutput - inputQuota) * 100) / 100;
  row(ops, y, '[46] Resultado régimen general', result, { bold: true, key: 'resultado_regimen_general' }); y -= 18;
  row(ops, y, '[71] Resultado de la liquidación', result, { bold: true, key: 'resultado_liquidacion' }); y -= 18;
  ops.push({ kind: 'text', x: LEFT, y: 60, text: 'Importes en euros.', size: 8 });
  return buildPdf([ops], `Modelo 303 ${vatYear} ${q.quarter}T (sintético)`);
}

function cuentasAnuales(): Uint8Array {
  const { balance: b, pnl: p, year } = annualAccounts;
  const currentAssets = b.inventories + b.tradeReceivables + b.cash;
  const totalAssets = b.nonCurrentAssets + currentAssets;
  const currentLiabilities = b.shortTermBankDebt + b.tradePayables;

  fixture = []; currentPage = 1;
  const page1: PdfOp[] = [];
  let y = header(page1, 'Cuentas anuales abreviadas — Balance', `${borrower.name} · NIF ${borrower.nif} · Ejercicio ${year} · Importes en euros`);
  note('nif', borrower.nif, `NIF ${borrower.nif}`);
  note('fiscal_year', String(year), `Ejercicio ${year}`);
  page1.push({ kind: 'text', x: LEFT, y, text: 'ACTIVO', size: 11, bold: true }); y -= 20;
  row(page1, y, 'A) Activo no corriente', b.nonCurrentAssets, { bold: true }); y -= 18;
  row(page1, y, 'B) Activo corriente', currentAssets, { bold: true, key: 'current_assets' }); y -= 16;
  row(page1, y, 'Existencias', b.inventories, { indent: 12 }); y -= 15;
  row(page1, y, 'Deudores comerciales y otras cuentas a cobrar', b.tradeReceivables, { indent: 12 }); y -= 15;
  row(page1, y, 'Efectivo y otros activos líquidos equivalentes', b.cash, { indent: 12, key: 'cash' }); y -= 20;
  row(page1, y, 'TOTAL ACTIVO (A + B)', totalAssets, { bold: true, key: 'total_assets' }); y -= 34;
  page1.push({ kind: 'text', x: LEFT, y, text: 'PATRIMONIO NETO Y PASIVO', size: 11, bold: true }); y -= 20;
  row(page1, y, 'A) Patrimonio neto', b.equity, { bold: true, key: 'equity' }); y -= 18;
  row(page1, y, 'B) Pasivo no corriente', b.longTermBankDebt, { bold: true }); y -= 16;
  row(page1, y, 'Deudas con entidades de crédito a largo plazo', b.longTermBankDebt, { indent: 12, key: 'long_term_bank_debt' }); y -= 18;
  row(page1, y, 'C) Pasivo corriente', currentLiabilities, { bold: true, key: 'current_liabilities' }); y -= 16;
  row(page1, y, 'Deudas con entidades de crédito a corto plazo', b.shortTermBankDebt, { indent: 12, key: 'short_term_bank_debt' }); y -= 15;
  row(page1, y, 'Acreedores comerciales y otras cuentas a pagar', b.tradePayables, { indent: 12 }); y -= 20;
  row(page1, y, 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', b.equity + b.longTermBankDebt + currentLiabilities, { bold: true });

  currentPage = 2;
  const page2: PdfOp[] = [];
  y = header(page2, 'Cuentas anuales abreviadas — Cuenta de pérdidas y ganancias', `${borrower.name} · NIF ${borrower.nif} · Ejercicio ${year} · Importes en euros`);
  const operating = p.revenue + p.supplies + p.personnel + p.otherOperating + p.depreciation;
  const beforeTax = operating + p.financialExpenses;
  const lines: [string, number, boolean, string?][] = [
    ['1. Importe neto de la cifra de negocios', p.revenue, false, 'revenue'],
    ['4. Aprovisionamientos', p.supplies, false, 'supplies'],
    ['6. Gastos de personal', p.personnel, false],
    ['7. Otros gastos de explotación', p.otherOperating, false],
    ['8. Amortización del inmovilizado', p.depreciation, false, 'depreciation'],
    ['A) RESULTADO DE EXPLOTACIÓN', operating, true, 'operating_result'],
    ['13. Gastos financieros', p.financialExpenses, false, 'financial_expenses'],
    ['C) RESULTADO ANTES DE IMPUESTOS', beforeTax, true],
    ['17. Impuestos sobre beneficios', p.incomeTax, false],
    ['D) RESULTADO DEL EJERCICIO', beforeTax + p.incomeTax, true, 'net_income'],
  ];
  for (const [label, amount, bold, key] of lines) { row(page2, y, label, amount, { bold, key }); y -= bold ? 24 : 16; }
  return buildPdf([page1, page2], `Cuentas anuales ${year} (sintético)`);
}

async function main() {
  const dir = path.join(process.cwd(), 'samples');
  await mkdir(dir, { recursive: true });
  const fixtures: Record<string, { documentType: string; sample: string; fields: FixtureField[] }> = {};
  const build = (name: string, documentType: string, make: () => Uint8Array) => {
    const bytes = make();
    fixtures[createHash('sha256').update(bytes).digest('hex')] = { documentType, sample: name, fields: fixture };
    return [name, bytes] as const;
  };
  const outputs = [
    ...vatQuarters.map(q => build(`modelo-303_${vatYear}_${q.quarter}T.pdf`, 'modelo_303', () => modelo303(q))),
    build(`cuentas-anuales_${annualAccounts.year}.pdf`, 'annual_accounts', cuentasAnuales),
  ];
  for (const [name, bytes] of outputs) {
    await writeFile(path.join(dir, name), bytes);
    console.log(`samples/${name} (${bytes.byteLength} bytes)`);
  }
  const fixturePath = path.join(process.cwd(), 'src', 'fixtures', 'extractions.ts');
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `// Generated by \`npm run samples\` from scripts/sample-data.ts. Do not edit by hand.
// Cached extraction results for the synthetic sample PDFs, keyed by SHA-256. They are what a correct
// extraction returns, built from the sample data (not recorded from the API), and are shown as "cached".
export const sampleExtractions: Record<string, { documentType: string; sample: string; fields: { key: string; value: string; page: number; quote: string }[] }> = ${JSON.stringify(fixtures, null, 2)};
`);
  console.log('src/fixtures/extractions.ts');
}

main().catch(error => { console.error(error); process.exit(1); });
