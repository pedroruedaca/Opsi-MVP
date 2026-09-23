import type { DocumentType } from './documents';
import { normalizeAmount } from './documents';

export type FieldKind = 'amount' | 'integer' | 'text';

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  // Modelo 303 box number, shown next to the label and given to the model as a location hint.
  casilla?: string;
  // Extra instruction for the extraction prompt.
  hint?: string;
};

// Modelo 303 casilla numbers, régimen general. Source: AEAT Modelo 303 instructions as summarised by
// SuperContable ("Casilla 28 Modelo 303") and TaxDown ("Las casillas del modelo 303"), checked 2026-09-23;
// the AEAT site itself was not reachable from the build environment. Orden HAC/27/2026 (BOE 26/01/2026)
// modified the 303 design: re-check these numbers against the official design before a pilot.
export const CASILLAS_VERIFIED_AGAINST_AEAT = false;

const modelo303: FieldDef[] = [
  { key: 'nif', label: 'NIF', kind: 'text' },
  { key: 'fiscal_year', label: 'Ejercicio', kind: 'integer' },
  { key: 'quarter', label: 'Periodo (trimestre)', kind: 'integer', hint: '1, 2, 3 o 4 (1T…4T).' },
  { key: 'base_4', label: 'Base imponible al 4 %', kind: 'amount', casilla: '01' },
  { key: 'cuota_4', label: 'Cuota al 4 %', kind: 'amount', casilla: '03' },
  { key: 'base_10', label: 'Base imponible al 10 %', kind: 'amount', casilla: '04' },
  { key: 'cuota_10', label: 'Cuota al 10 %', kind: 'amount', casilla: '06' },
  { key: 'base_21', label: 'Base imponible al 21 %', kind: 'amount', casilla: '07' },
  { key: 'cuota_21', label: 'Cuota al 21 %', kind: 'amount', casilla: '09' },
  { key: 'total_devengado', label: 'Total cuota devengada', kind: 'amount', casilla: '27' },
  { key: 'base_deducible_corrientes', label: 'IVA deducible, operaciones interiores corrientes (base)', kind: 'amount', casilla: '28' },
  { key: 'cuota_deducible_corrientes', label: 'IVA deducible, operaciones interiores corrientes (cuota)', kind: 'amount', casilla: '29' },
  { key: 'total_deducir', label: 'Total a deducir', kind: 'amount', casilla: '45' },
  { key: 'resultado_regimen_general', label: 'Resultado régimen general', kind: 'amount', casilla: '46' },
  { key: 'resultado_liquidacion', label: 'Resultado de la liquidación', kind: 'amount', casilla: '71' },
];

// Only lines that appear explicitly in Spanish abbreviated annual accounts. Derived figures
// (total debt, EBITDA when not stated, gross margin) are computed deterministically in Phase 3.
const annualAccounts: FieldDef[] = [
  { key: 'nif', label: 'NIF', kind: 'text' },
  { key: 'fiscal_year', label: 'Ejercicio', kind: 'integer' },
  { key: 'revenue', label: 'Importe neto de la cifra de negocios', kind: 'amount' },
  { key: 'supplies', label: 'Aprovisionamientos', kind: 'amount' },
  { key: 'depreciation', label: 'Amortización del inmovilizado', kind: 'amount' },
  { key: 'operating_result', label: 'Resultado de explotación', kind: 'amount' },
  { key: 'financial_expenses', label: 'Gastos financieros', kind: 'amount' },
  { key: 'net_income', label: 'Resultado del ejercicio', kind: 'amount' },
  { key: 'ebitda', label: 'EBITDA (solo si figura expresamente)', kind: 'amount', hint: 'Solo si el documento muestra una línea llamada EBITDA. No lo calcules.' },
  { key: 'total_assets', label: 'Total activo', kind: 'amount' },
  { key: 'current_assets', label: 'Activo corriente', kind: 'amount' },
  { key: 'cash', label: 'Efectivo y otros activos líquidos equivalentes', kind: 'amount' },
  { key: 'equity', label: 'Patrimonio neto', kind: 'amount' },
  { key: 'long_term_bank_debt', label: 'Deudas con entidades de crédito a largo plazo', kind: 'amount' },
  { key: 'short_term_bank_debt', label: 'Deudas con entidades de crédito a corto plazo', kind: 'amount' },
  { key: 'current_liabilities', label: 'Pasivo corriente', kind: 'amount' },
];

export const fieldDefs: Record<DocumentType, FieldDef[]> = { modelo_303: modelo303, annual_accounts: annualAccounts };

export function fieldDef(type: DocumentType, key: string): FieldDef | undefined {
  return fieldDefs[type].find(f => f.key === key);
}

// Parses a value into its canonical stored form, or returns null if it is not valid for the field.
// Amounts: plain decimal string with up to 2 decimals ("-760000.00"); Spanish input ("-760.000,00") is accepted.
export function canonicalValue(type: DocumentType, key: string, raw: string): string | null {
  const def = fieldDef(type, key);
  if (!def) return null;
  const v = raw.trim();
  if (!v) return null;
  if (def.kind === 'amount') {
    const negative = /^[-−(]/.test(v) || /\)$/.test(v);
    const n = normalizeAmount(v.replace(/^[-−(+]/, '').replace(/\)$/, ''));
    if (!/^\d{1,13}(\.\d{1,2})?$/.test(n)) return null;
    const [int, dec = ''] = n.split('.');
    const canonical = `${BigInt(int!).toString()}.${dec.padEnd(2, '0')}`;
    return negative && !/^0\.00$/.test(canonical) ? `-${canonical}` : canonical;
  }
  if (def.kind === 'integer') {
    if (!/^\d{1,4}$/.test(v)) return null;
    const n = Number(v);
    if (key === 'quarter' && (n < 1 || n > 4)) return null;
    if (key === 'fiscal_year' && (n < 1900 || n > 2100)) return null;
    return String(n);
  }
  const text = v.replace(/\s+/g, ' ');
  if (key === 'nif') {
    const nif = text.replace(/[\s.-]/g, '').toUpperCase();
    return /^[A-Z0-9]{9}$/.test(nif) ? nif : null;
  }
  return text.length <= 200 ? text : null;
}

export function formatValue(type: DocumentType, key: string, value: string | null): string {
  if (value === null) return '—';
  const def = fieldDef(type, key);
  if (def?.kind === 'amount') {
    const [int, dec = '00'] = value.replace('-', '').split('.');
    const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${value.startsWith('-') ? '−' : ''}${grouped},${dec} €`;
  }
  return value;
}
