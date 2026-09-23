// Deterministic analysis: confirmed field values in, metrics / checks / rule results / recommendation out.
// Pure (no I/O, no clock, no model). All arithmetic uses Decimal; values travel as decimal strings.
import Decimal from 'decimal.js';
import type { Policy, PolicyRule } from '@/policy/policy';

export type Recommendation = 'APPROVE' | 'REFER' | 'DECLINE';
export type MetricUnit = 'eur' | 'ratio' | 'multiple';

export type InputField = { fieldId: string; value: string | null };
export type InputDocument = {
  id: string; type: 'modelo_303' | 'annual_accounts'; period: string; filename: string; sha256: string;
  fields: Record<string, InputField>;
};
export type AnalysisInput = { caseNif: string; documents: InputDocument[] };

export type MetricInput = { label: string; value: string | null; fieldId: string | null };
export type Metric = {
  key: string; label: string; unit: MetricUnit; value: string | null; formula: string;
  period: string | null; inputs: MetricInput[]; missingReason: string | null;
};
export type Check = { id: string; label: string; status: 'pass' | 'fail' | 'missing'; detail: string; fieldIds: string[] };
export type RuleResult = PolicyRule & { index: number; value: string | null; unit: MetricUnit | null; status: 'pass' | 'fail' | 'missing'; explanation: string };
export type AnalysisOutput = { metrics: Metric[]; checks: Check[]; ruleResults: RuleResult[]; recommendation: Recommendation };

const TOLERANCE_EUR = new Decimal(1);
const RATES = [4, 10, 21] as const;

// ---------- formatting (Spanish) ----------
function group(intPart: string): string { return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
export function fmtEur(v: Decimal.Value): string {
  const d = new Decimal(v);
  const fixed = d.abs().toFixed(d.isInteger() ? 0 : 2);
  const [i, f] = fixed.split('.');
  return `${d.isNeg() ? '−' : ''}${group(i!)}${f ? ',' + f : ''} €`;
}
export function fmtPct(ratio: Decimal.Value, dp = 1): string { return `${new Decimal(ratio).times(100).toFixed(dp).replace('.', ',')} %`; }
export function fmtMultiple(v: Decimal.Value): string { return `${new Decimal(v).toFixed(2).replace('.', ',')}x`; }
export function fmtMetric(unit: MetricUnit, v: Decimal.Value): string {
  return unit === 'eur' ? fmtEur(v) : unit === 'ratio' ? fmtPct(v) : fmtMultiple(v);
}

// ---------- helpers ----------
const d = (v: string | null | undefined) => (v === null || v === undefined ? null : new Decimal(v));
function field(doc: InputDocument | undefined, key: string): InputField { return doc?.fields[key] ?? { fieldId: '', value: null }; }
function src(label: string, doc: InputDocument | undefined, key: string): MetricInput {
  const f = field(doc, key);
  return { label, value: f.value, fieldId: f.fieldId || null };
}
const quarterIndex = (period: string) => { const [y, q] = period.split('-Q'); return Number(y) * 4 + Number(q) - 1; };

function metric(m: Omit<Metric, 'value' | 'missingReason'>, compute: () => Decimal | string): Metric {
  const missing = m.inputs.filter(i => i.value === null).map(i => i.label);
  if (missing.length) return { ...m, value: null, missingReason: `Falta: ${missing.join(', ')}.` };
  const r = compute();
  if (typeof r === 'string') return { ...m, value: null, missingReason: r };
  return { ...m, value: r.toDecimalPlaces(m.unit === 'eur' ? 2 : 6).toString(), missingReason: null };
}

// ---------- 303 selection ----------
function latestFourQuarters(docs: InputDocument[]): { quarters: InputDocument[]; problem: string | null } {
  const q = docs.filter(x => x.type === 'modelo_303').sort((a, b) => quarterIndex(a.period) - quarterIndex(b.period));
  const periods = q.map(x => x.period);
  const dupes = periods.filter((p, i) => periods.indexOf(p) !== i);
  if (dupes.length) return { quarters: [], problem: `Hay más de un Modelo 303 para ${[...new Set(dupes)].join(', ')}.` };
  const last = q.slice(-4);
  if (last.length < 4) return { quarters: last, problem: `Hay ${last.length} trimestre(s); se necesitan 4 consecutivos.` };
  for (let i = 1; i < 4; i++) {
    if (quarterIndex(last[i]!.period) !== quarterIndex(last[i - 1]!.period) + 1) {
      return { quarters: last, problem: `Los cuatro últimos trimestres no son consecutivos (${last.map(x => x.period).join(', ')}).` };
    }
  }
  return { quarters: last, problem: null };
}

function quarterTurnover(doc: InputDocument): Decimal | null {
  let sum = new Decimal(0);
  for (const rate of RATES) {
    const v = d(field(doc, `base_${rate}`).value);
    if (v === null) return null;
    sum = sum.plus(v);
  }
  return sum;
}

// ---------- metrics ----------
export function computeMetrics(input: AnalysisInput): Metric[] {
  const { quarters, problem } = latestFourQuarters(input.documents);
  const accounts = input.documents.filter(x => x.type === 'annual_accounts').sort((a, b) => Number(b.period) - Number(a.period))[0];
  const acctPeriod = accounts?.period ?? null;
  const quarterRange = quarters.length ? `${quarters[0]!.period} – ${quarters.at(-1)!.period}` : null;
  const turnoverInputs = quarters.flatMap(q => RATES.map(rate => src(`Base ${rate} % ${q.period}`, q, `base_${rate}`)));

  const vatTtm = metric({
    key: 'vat_turnover_ttm', label: 'Facturación declarada en IVA (12 meses)', unit: 'eur', period: quarterRange,
    formula: 'Σ bases imponibles [01]+[04]+[07] de los 4 últimos trimestres', inputs: turnoverInputs,
  }, () => problem ?? quarters.reduce((s, q) => s.plus(quarterTurnover(q)!), new Decimal(0)));

  const minRatio = metric({
    key: 'quarterly_min_ratio', label: 'Peor trimestre / media trimestral', unit: 'ratio', period: quarterRange,
    formula: 'min(facturación trimestral) / media(facturación trimestral)', inputs: turnoverInputs,
  }, () => {
    if (problem) return problem;
    const t = quarters.map(q => quarterTurnover(q)!);
    const avg = t.reduce((s, v) => s.plus(v), new Decimal(0)).div(4);
    return avg.isZero() ? 'La facturación media es cero.' : Decimal.min(...t).div(avg);
  });

  const revenue = src('Importe neto de la cifra de negocios', accounts, 'revenue');
  const noAccounts = accounts ? null : 'No hay cuentas anuales.';
  const withAccounts = (m: Omit<Metric, 'value' | 'missingReason' | 'period'>, f: () => Decimal | string) =>
    noAccounts ? { ...m, period: null, value: null, missingReason: noAccounts } : metric({ ...m, period: acctPeriod }, f);

  const statedEbitda = d(field(accounts, 'ebitda').value);
  const ebitdaInputs = statedEbitda !== null
    ? [src('EBITDA (declarado)', accounts, 'ebitda')]
    : [src('Resultado de explotación', accounts, 'operating_result'), src('Amortización del inmovilizado', accounts, 'depreciation')];
  const ebitda = withAccounts({
    key: 'ebitda', label: 'EBITDA', unit: 'eur',
    formula: statedEbitda !== null ? 'EBITDA declarado en las cuentas' : 'Resultado de explotación + |Amortización del inmovilizado|', inputs: ebitdaInputs,
  }, () => statedEbitda ?? d(ebitdaInputs[0]!.value)!.plus(d(ebitdaInputs[1]!.value)!.abs()));

  const debtInputs = [src('Deudas con entidades de crédito a largo plazo', accounts, 'long_term_bank_debt'), src('Deudas con entidades de crédito a corto plazo', accounts, 'short_term_bank_debt')];
  const debt = withAccounts({
    key: 'financial_debt', label: 'Deuda financiera', unit: 'eur',
    formula: 'Deudas con entidades de crédito a largo plazo + a corto plazo', inputs: debtInputs,
  }, () => d(debtInputs[0]!.value)!.plus(d(debtInputs[1]!.value)!));

  const revenueMetric = withAccounts({ key: 'revenue', label: 'Cifra de negocios', unit: 'eur', formula: 'Importe neto de la cifra de negocios', inputs: [revenue] },
    () => d(revenue.value)!);

  const supplies = src('Aprovisionamientos', accounts, 'supplies');
  const grossMargin = withAccounts({
    key: 'gross_margin', label: 'Margen bruto', unit: 'ratio', formula: '(Cifra de negocios − |Aprovisionamientos|) / Cifra de negocios', inputs: [revenue, supplies],
  }, () => { const r = d(revenue.value)!; return r.lte(0) ? 'La cifra de negocios no es positiva.' : r.minus(d(supplies.value)!.abs()).div(r); });

  const ebitdaMargin = withAccounts({
    key: 'ebitda_margin', label: 'Margen EBITDA', unit: 'ratio', formula: 'EBITDA / Cifra de negocios', inputs: [...ebitdaInputs, revenue],
  }, () => { const r = d(revenue.value)!; return r.lte(0) ? 'La cifra de negocios no es positiva.' : ebitda.value === null ? ebitda.missingReason! : new Decimal(ebitda.value).div(r); });

  const caInputs = [src('Activo corriente', accounts, 'current_assets'), src('Pasivo corriente', accounts, 'current_liabilities')];
  const currentRatio = withAccounts({
    key: 'current_ratio', label: 'Liquidez corriente', unit: 'multiple', formula: 'Activo corriente / Pasivo corriente', inputs: caInputs,
  }, () => { const l = d(caInputs[1]!.value)!; return l.lte(0) ? 'El pasivo corriente no es positivo.' : d(caInputs[0]!.value)!.div(l); });

  const leverage = withAccounts({
    key: 'debt_to_ebitda', label: 'Deuda financiera / EBITDA', unit: 'multiple', formula: 'Deuda financiera / EBITDA (sin calcular si EBITDA ≤ 0)', inputs: [...debtInputs, ...ebitdaInputs],
  }, () => {
    if (ebitda.value === null || debt.value === null) return ebitda.missingReason ?? debt.missingReason!;
    const e = new Decimal(ebitda.value);
    return e.lte(0) ? `EBITDA no positivo (${fmtEur(e)}): el ratio no es significativo.` : new Decimal(debt.value).div(e);
  });

  const gap: Metric = (() => {
    const base = { key: 'vat_accounts_gap', label: 'Desviación IVA vs. cuentas anuales', unit: 'ratio' as const, period: acctPeriod,
      formula: '|Facturación IVA 12 meses / Cifra de negocios − 1|', inputs: [...turnoverInputs, revenue] };
    if (noAccounts) return { ...base, value: null, missingReason: noAccounts };
    if (vatTtm.value === null) return { ...base, value: null, missingReason: vatTtm.missingReason };
    const years = new Set(quarters.map(q => q.period.slice(0, 4)));
    if (years.size !== 1 || !years.has(acctPeriod!)) {
      return { ...base, value: null, missingReason: `Los trimestres (${quarterRange}) no corresponden al ejercicio de las cuentas (${acctPeriod}).` };
    }
    return metric(base, () => { const r = d(revenue.value)!; return r.lte(0) ? 'La cifra de negocios no es positiva.' : new Decimal(vatTtm.value!).div(r).minus(1).abs(); });
  })();

  return [vatTtm, minRatio, revenueMetric, ebitda, debt, grossMargin, ebitdaMargin, currentRatio, leverage, gap];
}

// ---------- consistency checks ----------
export function computeChecks(input: AnalysisInput): Check[] {
  const checks: Check[] = [];
  const ids = (...fs: InputField[]) => fs.map(f => f.fieldId).filter(Boolean);
  const near = (a: Decimal, b: Decimal) => a.minus(b).abs().lte(TOLERANCE_EUR);

  for (const doc of input.documents.filter(x => x.type === 'modelo_303').sort((a, b) => quarterIndex(a.period) - quarterIndex(b.period))) {
    for (const rate of RATES) {
      const base = field(doc, `base_${rate}`), cuota = field(doc, `cuota_${rate}`);
      const id = `vat-rate-${rate}-${doc.period}`, label = `${doc.period}: base × ${rate} % = cuota`;
      if (base.value === null || cuota.value === null) { checks.push({ id, label, status: 'missing', detail: 'Falta la base o la cuota.', fieldIds: ids(base, cuota) }); continue; }
      const expected = new Decimal(base.value).times(rate).div(100).toDecimalPlaces(2);
      const ok = near(expected, new Decimal(cuota.value));
      checks.push({ id, label, status: ok ? 'pass' : 'fail', fieldIds: ids(base, cuota),
        detail: `${fmtEur(base.value)} × ${rate} % = ${fmtEur(expected)}; declarado ${fmtEur(cuota.value)}${ok ? '' : ` (diferencia ${fmtEur(expected.minus(cuota.value).abs())})`}.` });
    }

    const cuotas = RATES.map(rate => field(doc, `cuota_${rate}`)), total = field(doc, 'total_devengado');
    const sumId = `vat-total-${doc.period}`, sumLabel = `${doc.period}: Σ cuotas = total devengado [27]`;
    if ([...cuotas, total].some(f => f.value === null)) checks.push({ id: sumId, label: sumLabel, status: 'missing', detail: 'Faltan cuotas o el total devengado.', fieldIds: ids(...cuotas, total) });
    else {
      const sum = cuotas.reduce((s, f) => s.plus(f.value!), new Decimal(0));
      const ok = near(sum, new Decimal(total.value!));
      checks.push({ id: sumId, label: sumLabel, status: ok ? 'pass' : 'fail', fieldIds: ids(...cuotas, total),
        detail: `Σ cuotas ${fmtEur(sum)}; total devengado ${fmtEur(total.value!)}${ok ? '' : ` (diferencia ${fmtEur(sum.minus(total.value!).abs())}; puede haber otras partidas no extraídas)`}.` });
    }

    const deducir = field(doc, 'total_deducir'), result = field(doc, 'resultado_regimen_general');
    const resId = `vat-result-${doc.period}`, resLabel = `${doc.period}: [27] − [45] = [46]`;
    if ([total, deducir, result].some(f => f.value === null)) checks.push({ id: resId, label: resLabel, status: 'missing', detail: 'Falta el total devengado, el total a deducir o el resultado.', fieldIds: ids(total, deducir, result) });
    else {
      const expected = new Decimal(total.value!).minus(deducir.value!);
      const ok = near(expected, new Decimal(result.value!));
      checks.push({ id: resId, label: resLabel, status: ok ? 'pass' : 'fail', fieldIds: ids(total, deducir, result),
        detail: `${fmtEur(total.value!)} − ${fmtEur(deducir.value!)} = ${fmtEur(expected)}; declarado ${fmtEur(result.value!)}.` });
    }
  }

  const { quarters, problem } = latestFourQuarters(input.documents);
  checks.push({ id: 'quarters-consecutive', label: 'Cuatro trimestres consecutivos de Modelo 303',
    status: problem ? (quarters.length < 4 ? 'missing' : 'fail') : 'pass',
    detail: problem ?? `Trimestres ${quarters.map(q => q.period).join(', ')}.`, fieldIds: [] });

  for (const doc of input.documents) {
    const year = field(doc, 'fiscal_year'), quarter = field(doc, 'quarter');
    const id = `period-${doc.id}`, label = `${doc.filename}: periodo del documento = periodo indicado`;
    const actual = doc.type === 'modelo_303' ? (year.value && quarter.value ? `${year.value}-Q${quarter.value}` : null) : year.value;
    checks.push(actual === null
      ? { id, label, status: 'missing', detail: 'Falta el ejercicio o el periodo en el documento.', fieldIds: ids(year, quarter) }
      : { id, label, status: actual === doc.period ? 'pass' : 'fail', detail: `Documento ${actual}; indicado ${doc.period}.`, fieldIds: ids(year, quarter) });
  }

  const nifs = input.documents.map(doc => ({ doc, f: field(doc, 'nif') }));
  const missingNif = nifs.filter(n => n.f.value === null);
  const wrongNif = nifs.filter(n => n.f.value !== null && n.f.value !== input.caseNif);
  checks.push({
    id: 'nif-match', label: 'NIF de todos los documentos = NIF del caso',
    status: wrongNif.length ? 'fail' : missingNif.length ? 'missing' : 'pass', fieldIds: nifs.map(n => n.f.fieldId).filter(Boolean),
    detail: wrongNif.length ? `No coincide en: ${wrongNif.map(n => `${n.doc.filename} (${n.f.value})`).join(', ')}; caso ${input.caseNif}.`
      : missingNif.length ? `Falta el NIF en: ${missingNif.map(n => n.doc.filename).join(', ')}.` : `Todos los documentos: ${input.caseNif}.`,
  });
  return checks;
}

// ---------- policy ----------
function explain(rule: PolicyRule, index: number, m: Metric | undefined, status: RuleResult['status']): string {
  const n = `Regla ${index}`;
  // Lower-case only the first letter so acronyms (IVA, EBITDA) keep their case.
  const raw = m?.label ?? rule.metric;
  const label = raw.charAt(0).toLowerCase() + raw.slice(1);
  if (status === 'missing') return `${n} sin datos: no se puede calcular ${label}. ${m?.missingReason ?? 'Métrica no disponible.'}`;
  const unit = m!.unit, v = new Decimal(m!.value!), t = new Decimal(rule.threshold);
  const bound = rule.operator === 'gte' ? 'mínimo' : 'máximo';
  const cmp = rule.operator === 'gte' ? '≥' : '≤';
  if (status === 'pass') return `${n} superada: ${label} de ${fmtMetric(unit, v)} ${cmp} ${bound} de ${fmtMetric(unit, t)}.`;
  const dir = rule.operator === 'gte' ? 'por debajo del' : 'por encima del';
  const diff = unit === 'ratio'
    ? `${v.minus(t).abs().times(100).toFixed(1).replace('.', ',')} puntos`
    : t.isZero() ? fmtMetric(unit, v.minus(t).abs()) : fmtPct(v.minus(t).abs().div(t.abs()));
  return `${n} no superada: ${label} de ${fmtMetric(unit, v)} está ${diff} ${dir} ${bound} de ${fmtMetric(unit, t)}.`;
}

export function evaluatePolicy(metrics: Metric[], p: Policy): RuleResult[] {
  return p.rules.map((rule, i) => {
    const m = metrics.find(x => x.key === rule.metric);
    const value = m?.value ?? null;
    const status: RuleResult['status'] = value === null ? 'missing'
      : (rule.operator === 'gte' ? new Decimal(value).gte(rule.threshold) : new Decimal(value).lte(rule.threshold)) ? 'pass' : 'fail';
    return { ...rule, index: i + 1, value, unit: m?.unit ?? null, status, explanation: explain(rule, i + 1, m, status) };
  });
}

// Any hard failure → DECLINE. Otherwise any borderline failure, missing input or failed/missing
// consistency check → REFER. Otherwise APPROVE.
export function recommend(rules: RuleResult[], checks: Check[]): Recommendation {
  if (rules.some(r => r.status === 'fail' && r.severity === 'hard')) return 'DECLINE';
  if (rules.some(r => r.status !== 'pass') || checks.some(c => c.status !== 'pass')) return 'REFER';
  return 'APPROVE';
}

export function analyse(input: AnalysisInput, p: Policy): AnalysisOutput {
  const metrics = computeMetrics(input);
  const checks = computeChecks(input);
  const ruleResults = evaluatePolicy(metrics, p);
  return { metrics, checks, ruleResults, recommendation: recommend(ruleResults, checks) };
}

// Catalog for the read-only policy page. Kept in sync with computeMetrics by a unit test.
export const metricCatalog: { key: string; label: string; unit: MetricUnit; formula: string; note?: string }[] = [
  { key: 'vat_turnover_ttm', label: 'Facturación declarada en IVA (12 meses)', unit: 'eur', formula: 'Σ bases imponibles [01]+[04]+[07] de los 4 últimos trimestres', note: 'Requiere 4 trimestres consecutivos.' },
  { key: 'quarterly_min_ratio', label: 'Peor trimestre / media trimestral', unit: 'ratio', formula: 'min(facturación trimestral) / media(facturación trimestral)' },
  { key: 'revenue', label: 'Cifra de negocios', unit: 'eur', formula: 'Importe neto de la cifra de negocios' },
  { key: 'ebitda', label: 'EBITDA', unit: 'eur', formula: 'Resultado de explotación + |Amortización del inmovilizado|', note: 'Si las cuentas declaran el EBITDA, se usa ese valor.' },
  { key: 'financial_debt', label: 'Deuda financiera', unit: 'eur', formula: 'Deudas con entidades de crédito a largo plazo + a corto plazo' },
  { key: 'gross_margin', label: 'Margen bruto', unit: 'ratio', formula: '(Cifra de negocios − |Aprovisionamientos|) / Cifra de negocios' },
  { key: 'ebitda_margin', label: 'Margen EBITDA', unit: 'ratio', formula: 'EBITDA / Cifra de negocios' },
  { key: 'current_ratio', label: 'Liquidez corriente', unit: 'multiple', formula: 'Activo corriente / Pasivo corriente' },
  { key: 'debt_to_ebitda', label: 'Deuda financiera / EBITDA', unit: 'multiple', formula: 'Deuda financiera / EBITDA (sin calcular si EBITDA ≤ 0)' },
  { key: 'vat_accounts_gap', label: 'Desviación IVA vs. cuentas anuales', unit: 'ratio', formula: '|Facturación IVA 12 meses / Cifra de negocios − 1|', note: 'Solo si los 4 trimestres son del mismo ejercicio que las cuentas.' },
];
