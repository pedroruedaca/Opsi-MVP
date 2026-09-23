import { describe, expect, it } from 'vitest';
import { sampleExtractions } from '@/fixtures/extractions';
import { policy } from '@/policy/policy';
import { analyse, computeChecks, computeMetrics, evaluatePolicy, fmtEur, recommend, type AnalysisInput, type InputDocument } from './analysis';
import { fieldDefs } from './fields';

// The demo borrower, built from the cached sample extractions (every field confirmed as extracted).
function demo(): AnalysisInput {
  const documents: InputDocument[] = Object.entries(sampleExtractions).map(([sha, fx]) => {
    const type = fx.documentType as InputDocument['type'];
    const values = Object.fromEntries(fx.fields.map(f => [f.key, f.value]));
    const period = type === 'modelo_303' ? `${values.fiscal_year}-Q${values.quarter}` : values.fiscal_year!;
    const fields = Object.fromEntries(fieldDefs[type].map(def => [def.key, { fieldId: `${period}:${def.key}`, value: values[def.key] ?? null }]));
    return { id: period, type, period, filename: fx.sample, sha256: sha, fields };
  });
  return { caseNif: 'B00000000', documents };
}
function set(input: AnalysisInput, period: string, key: string, value: string | null): AnalysisInput {
  return { ...input, documents: input.documents.map(doc => doc.period !== period ? doc : { ...doc, fields: { ...doc.fields, [key]: { fieldId: `${period}:${key}`, value } } }) };
}
const metricValue = (input: AnalysisInput, key: string) => computeMetrics(input).find(m => m.key === key)!;

describe('metrics on the demo borrower', () => {
  const metrics = computeMetrics(demo());
  const v = (k: string) => metrics.find(m => m.key === k)!.value;
  it('computes each metric exactly', () => {
    expect(v('vat_turnover_ttm')).toBe('1202000');
    expect(v('quarterly_min_ratio')).toBe('0.881864'); // 265.000 / 300.500
    expect(v('revenue')).toBe('1210000');
    expect(v('ebitda')).toBe('150000'); // 115.000 + |−35.000|
    expect(v('financial_debt')).toBe('310000');
    expect(v('gross_margin')).toBe('0.371901'); // (1.210.000 − 760.000) / 1.210.000
    expect(v('ebitda_margin')).toBe('0.123967');
    expect(v('current_ratio')).toBe('1.714286');
    expect(v('debt_to_ebitda')).toBe('2.066667');
    expect(v('vat_accounts_gap')).toBe('0.006612');
  });
  it('keeps formula and source field ids for every input', () => {
    const lev = metrics.find(m => m.key === 'debt_to_ebitda')!;
    expect(lev.formula).toMatch(/Deuda financiera \/ EBITDA/);
    expect(lev.inputs.map(i => i.fieldId)).toEqual(['2025:long_term_bank_debt', '2025:short_term_bank_debt', '2025:operating_result', '2025:depreciation']);
    expect(metrics.find(m => m.key === 'vat_turnover_ttm')!.inputs).toHaveLength(12);
  });
  it('uses a stated EBITDA instead of deriving it', () => {
    const m = metricValue(set(demo(), '2025', 'ebitda', '160000.00'), 'ebitda');
    expect(m.value).toBe('160000');
    expect(m.formula).toBe('EBITDA declarado en las cuentas');
  });
});

describe('demo recommendation', () => {
  it('approves when every rule and check passes', () => {
    const out = analyse(demo(), policy);
    expect(out.checks.filter(c => c.status !== 'pass')).toEqual([]);
    expect(out.ruleResults.every(r => r.status === 'pass')).toBe(true);
    expect(out.recommendation).toBe('APPROVE');
    expect(out.ruleResults[0]!.explanation).toBe('Regla 1 superada: facturación declarada en IVA (12 meses) de 1.202.000 € ≥ mínimo de 250.000 €.');
  });
});

describe('missing is not failing', () => {
  it('refers (not declines) when a rule input was left empty', () => {
    const out = analyse(set(demo(), '2025', 'short_term_bank_debt', null), policy);
    const lev = out.ruleResults.find(r => r.metric === 'debt_to_ebitda')!;
    expect(lev.status).toBe('missing');
    expect(lev.explanation).toMatch(/^Regla 2 sin datos: .*Falta: Deudas con entidades de crédito a corto plazo\./);
    expect(out.recommendation).toBe('REFER');
  });
  it('does not compute leverage with non-positive EBITDA', () => {
    const input = set(set(demo(), '2025', 'operating_result', '-50000.00'), '2025', 'depreciation', '-35000.00');
    const m = metricValue(input, 'debt_to_ebitda');
    expect(m.value).toBeNull();
    expect(m.missingReason).toMatch(/EBITDA no positivo \(−15.000 €\)/);
  });
  it('treats missing quarters and missing accounts as missing', () => {
    const three = { ...demo(), documents: demo().documents.filter(d => d.period !== '2025-Q4') };
    expect(metricValue(three, 'vat_turnover_ttm').missingReason).toBe('Hay 3 trimestre(s); se necesitan 4 consecutivos.');
    expect(computeChecks(three).find(c => c.id === 'quarters-consecutive')!.status).toBe('missing');
    const noAccounts = { ...demo(), documents: demo().documents.filter(d => d.type === 'modelo_303') };
    expect(metricValue(noAccounts, 'current_ratio').missingReason).toBe('No hay cuentas anuales.');
    expect(analyse(noAccounts, policy).recommendation).toBe('REFER');
  });
});

describe('failures', () => {
  it('declines on a hard failure and explains it with numbers', () => {
    const out = analyse(set(demo(), '2025', 'long_term_bank_debt', '500000.00'), policy); // debt 560.000 / 150.000 = 3,73x
    const lev = out.ruleResults.find(r => r.metric === 'debt_to_ebitda')!;
    expect(lev.status).toBe('fail');
    expect(lev.explanation).toBe('Regla 2 no superada: deuda financiera / EBITDA de 3,73x está 6,7 % por encima del máximo de 3,50x.');
    expect(out.recommendation).toBe('DECLINE');
  });
  it('matches the spec example for a turnover shortfall', () => {
    const [rule] = evaluatePolicy([{ key: 'vat_turnover_ttm', label: 'Facturación declarada en IVA', unit: 'eur', value: '212400', formula: '', period: null, inputs: [], missingReason: null }], { ...policy, rules: [policy.rules[0]!] });
    expect(rule!.explanation).toBe('Regla 1 no superada: facturación declarada en IVA de 212.400 € está 15,0 % por debajo del mínimo de 250.000 €.');
  });
  it('explains ratio shortfalls in percentage points', () => {
    // EBITDA 90.000 → margin 7,4 % (borderline fail); leverage 3,44x still passes.
    const out = analyse(set(demo(), '2025', 'operating_result', '55000.00'), policy);
    expect(out.ruleResults.find(r => r.metric === 'ebitda_margin')!.explanation)
      .toBe('Regla 3 no superada: margen EBITDA de 7,4 % está 0,6 puntos por debajo del mínimo de 8,0 %.');
    expect(out.ruleResults.find(r => r.metric === 'debt_to_ebitda')!.status).toBe('pass');
    expect(out.recommendation).toBe('REFER');
  });
});

describe('consistency checks', () => {
  it('flags a VAT quota that does not match base × rate, beyond €1', () => {
    const checks = computeChecks(set(demo(), '2025-Q2', 'cuota_21', '65000.00'));
    const c = checks.find(x => x.id === 'vat-rate-21-2025-Q2')!;
    expect(c.status).toBe('fail');
    expect(c.detail).toBe('310.000 € × 21 % = 65.100 €; declarado 65.000 € (diferencia 100 €).');
    expect(c.fieldIds).toEqual(['2025-Q2:base_21', '2025-Q2:cuota_21']);
    expect(computeChecks(set(demo(), '2025-Q2', 'cuota_21', '65100.90')).find(x => x.id === 'vat-rate-21-2025-Q2')!.status).toBe('pass');
  });
  it('checks Σ cuotas = [27] and [27] − [45] = [46]', () => {
    expect(computeChecks(set(demo(), '2025-Q1', 'total_devengado', '60000.00')).find(x => x.id === 'vat-total-2025-Q1')!.status).toBe('fail');
    expect(computeChecks(set(demo(), '2025-Q1', 'resultado_regimen_general', '1.00')).find(x => x.id === 'vat-result-2025-Q1')!.status).toBe('fail');
  });
  it('refers when a check fails even if every rule passes', () => {
    const input = set(demo(), '2025-Q3', 'total_deducir', '38000.00');
    const out = analyse(input, policy);
    expect(out.ruleResults.every(r => r.status === 'pass')).toBe(true);
    expect(out.recommendation).toBe('REFER');
  });
  it('detects non-consecutive quarters, period mismatches and NIF mismatches', () => {
    const gap = { ...demo(), documents: demo().documents.map(d => d.period === '2025-Q1' ? { ...d, period: '2024-Q4' } : d) };
    expect(computeChecks(gap).find(c => c.id === 'quarters-consecutive')).toMatchObject({ status: 'fail' });
    expect(computeChecks(gap).find(c => c.id === 'period-2025-Q1')).toMatchObject({ status: 'fail', detail: 'Documento 2025-Q1; indicado 2024-Q4.' });
    const nif = computeChecks(set(demo(), '2025', 'nif', 'B99999999')).find(c => c.id === 'nif-match')!;
    expect(nif.status).toBe('fail');
    expect(nif.detail).toMatch(/cuentas-anuales_2025.pdf \(B99999999\)/);
  });
  it('does not compare VAT and accounts from different years', () => {
    const input = { ...demo(), documents: demo().documents.map(d => d.type === 'annual_accounts' ? { ...d, period: '2024' } : d) };
    expect(metricValue(input, 'vat_accounts_gap').missingReason).toMatch(/no corresponden al ejercicio de las cuentas \(2024\)/);
  });
});

describe('recommend', () => {
  const r = (status: 'pass' | 'fail' | 'missing', severity: 'hard' | 'borderline') => ({ ...policy.rules[0]!, severity, status, index: 1, value: null, unit: null, explanation: '' });
  it('applies DECLINE > REFER > APPROVE', () => {
    expect(recommend([r('fail', 'hard'), r('missing', 'borderline')], [])).toBe('DECLINE');
    expect(recommend([r('fail', 'borderline')], [])).toBe('REFER');
    expect(recommend([r('missing', 'hard')], [])).toBe('REFER');
    expect(recommend([r('pass', 'hard')], [{ id: 'x', label: '', status: 'missing', detail: '', fieldIds: [] }])).toBe('REFER');
    expect(recommend([r('pass', 'hard')], [])).toBe('APPROVE');
  });
  it('formats euros without float artefacts', () => {
    expect(fmtEur('0.1')).toBe('0,10 €');
    expect(fmtEur('-1234567.5')).toBe('−1.234.567,50 €');
  });
});

describe('metricCatalog', () => {
  it('matches what computeMetrics produces', async () => {
    const { metricCatalog } = await import('./analysis');
    const metrics = computeMetrics(demo());
    expect(metricCatalog.map(m => m.key)).toEqual(metrics.map(m => m.key));
    for (const m of metrics) expect(metricCatalog.find(c => c.key === m.key)).toMatchObject({ label: m.label, unit: m.unit, formula: m.formula });
    for (const rule of policy.rules) expect(metricCatalog.some(m => m.key === rule.metric)).toBe(true);
  });
});
