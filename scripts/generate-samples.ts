// Builds the synthetic sample PDFs in samples/ from scripts/sample-data.ts.
// Run with `npm run samples`; the output is committed so the demo works offline.
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

function row(ops: PdfOp[], y: number, label: string, amount: number | null, opts: { bold?: boolean; indent?: number } = {}) {
  ops.push({ kind: 'text', x: LEFT + (opts.indent ?? 0), y, text: label, size: 10, bold: opts.bold });
  if (amount !== null) ops.push({ kind: 'text', x: RIGHT, y, text: eurEs(amount), size: 10, bold: opts.bold, align: 'right' });
}

function modelo303(q: VatQuarter): Uint8Array {
  const ops: PdfOp[] = [];
  let y = header(ops, 'Modelo 303 — IVA. Autoliquidación', `Ejercicio ${vatYear} · Periodo ${q.quarter}T`);
  for (const [label, value] of [['NIF', borrower.nif], ['Apellidos y nombre o razón social', borrower.name], ['Domicilio', borrower.address]] as const) {
    ops.push({ kind: 'text', x: LEFT, y, text: `${label}: ${value}`, size: 10 }); y -= 16;
  }
  y -= 10;
  ops.push({ kind: 'text', x: LEFT, y, text: 'IVA devengado — Régimen general', size: 11, bold: true }); y -= 20;
  let totalOutput = 0;
  for (const rate of [4, 10, 21] as const) {
    const base = q.output.find(o => o.rate === rate)?.base ?? 0;
    const quota = vatAmount(base, rate);
    totalOutput += quota;
    row(ops, y, `Base imponible al ${rate} %`, base, { indent: 10 }); y -= 15;
    row(ops, y, `Cuota al ${rate} %`, quota, { indent: 10 }); y -= 19;
  }
  row(ops, y, 'Total cuota devengada', totalOutput, { bold: true }); y -= 28;

  ops.push({ kind: 'text', x: LEFT, y, text: 'IVA deducible', size: 11, bold: true }); y -= 20;
  const inputQuota = vatAmount(q.inputBase, 21);
  row(ops, y, 'Cuotas soportadas en operaciones interiores corrientes — base', q.inputBase, { indent: 10 }); y -= 15;
  row(ops, y, 'Cuotas soportadas en operaciones interiores corrientes — cuota', inputQuota, { indent: 10 }); y -= 19;
  row(ops, y, 'Total a deducir', inputQuota, { bold: true }); y -= 28;

  ops.push({ kind: 'rule', x1: LEFT, x2: RIGHT, y: y + 12 });
  const result = Math.round((totalOutput - inputQuota) * 100) / 100;
  row(ops, y, 'Resultado régimen general', result, { bold: true }); y -= 18;
  row(ops, y, 'Resultado de la liquidación', result, { bold: true }); y -= 18;
  ops.push({ kind: 'text', x: LEFT, y: 60, text: 'Importes en euros.', size: 8 });
  return buildPdf([ops], `Modelo 303 ${vatYear} ${q.quarter}T (sintético)`);
}

function cuentasAnuales(): Uint8Array {
  const { balance: b, pnl: p, year } = annualAccounts;
  const currentAssets = b.inventories + b.tradeReceivables + b.cash;
  const totalAssets = b.nonCurrentAssets + currentAssets;
  const currentLiabilities = b.shortTermBankDebt + b.tradePayables;

  const page1: PdfOp[] = [];
  let y = header(page1, 'Cuentas anuales abreviadas — Balance', `${borrower.name} · NIF ${borrower.nif} · Ejercicio ${year} · Importes en euros`);
  page1.push({ kind: 'text', x: LEFT, y, text: 'ACTIVO', size: 11, bold: true }); y -= 20;
  row(page1, y, 'A) Activo no corriente', b.nonCurrentAssets, { bold: true }); y -= 18;
  row(page1, y, 'B) Activo corriente', currentAssets, { bold: true }); y -= 16;
  row(page1, y, 'Existencias', b.inventories, { indent: 12 }); y -= 15;
  row(page1, y, 'Deudores comerciales y otras cuentas a cobrar', b.tradeReceivables, { indent: 12 }); y -= 15;
  row(page1, y, 'Efectivo y otros activos líquidos equivalentes', b.cash, { indent: 12 }); y -= 20;
  row(page1, y, 'TOTAL ACTIVO (A + B)', totalAssets, { bold: true }); y -= 34;
  page1.push({ kind: 'text', x: LEFT, y, text: 'PATRIMONIO NETO Y PASIVO', size: 11, bold: true }); y -= 20;
  row(page1, y, 'A) Patrimonio neto', b.equity, { bold: true }); y -= 18;
  row(page1, y, 'B) Pasivo no corriente', b.longTermBankDebt, { bold: true }); y -= 16;
  row(page1, y, 'Deudas con entidades de crédito a largo plazo', b.longTermBankDebt, { indent: 12 }); y -= 18;
  row(page1, y, 'C) Pasivo corriente', currentLiabilities, { bold: true }); y -= 16;
  row(page1, y, 'Deudas con entidades de crédito a corto plazo', b.shortTermBankDebt, { indent: 12 }); y -= 15;
  row(page1, y, 'Acreedores comerciales y otras cuentas a pagar', b.tradePayables, { indent: 12 }); y -= 20;
  row(page1, y, 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', b.equity + b.longTermBankDebt + currentLiabilities, { bold: true });

  const page2: PdfOp[] = [];
  y = header(page2, 'Cuentas anuales abreviadas — Cuenta de pérdidas y ganancias', `${borrower.name} · NIF ${borrower.nif} · Ejercicio ${year} · Importes en euros`);
  const operating = p.revenue + p.supplies + p.personnel + p.otherOperating + p.depreciation;
  const beforeTax = operating + p.financialExpenses;
  const lines: [string, number, boolean][] = [
    ['1. Importe neto de la cifra de negocios', p.revenue, false],
    ['4. Aprovisionamientos', p.supplies, false],
    ['6. Gastos de personal', p.personnel, false],
    ['7. Otros gastos de explotación', p.otherOperating, false],
    ['8. Amortización del inmovilizado', p.depreciation, false],
    ['A) RESULTADO DE EXPLOTACIÓN', operating, true],
    ['13. Gastos financieros', p.financialExpenses, false],
    ['C) RESULTADO ANTES DE IMPUESTOS', beforeTax, true],
    ['17. Impuestos sobre beneficios', p.incomeTax, false],
    ['D) RESULTADO DEL EJERCICIO', beforeTax + p.incomeTax, true],
  ];
  for (const [label, amount, bold] of lines) { row(page2, y, label, amount, { bold }); y -= bold ? 24 : 16; }
  return buildPdf([page1, page2], `Cuentas anuales ${year} (sintético)`);
}

async function main() {
  const dir = path.join(process.cwd(), 'samples');
  await mkdir(dir, { recursive: true });
  const outputs: [string, Uint8Array][] = [
    ...vatQuarters.map(q => [`modelo-303_${vatYear}_${q.quarter}T.pdf`, modelo303(q)] as [string, Uint8Array]),
    [`cuentas-anuales_${annualAccounts.year}.pdf`, cuentasAnuales()],
  ];
  for (const [name, bytes] of outputs) {
    await writeFile(path.join(dir, name), bytes);
    console.log(`samples/${name} (${bytes.byteLength} bytes)`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
