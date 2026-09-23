// The lending policy, as data. Bump `version` on any change: every analysis stores the version and a
// full copy of the rules it ran with. THRESHOLDS ARE ILLUSTRATIVE demo values, not a lender's policy.
export type RuleOperator = 'gte' | 'lte';
export type RuleSeverity = 'hard' | 'borderline';
export type PolicyRule = {
  id: string; metric: string; operator: RuleOperator; threshold: string; severity: RuleSeverity; label: string;
};
export type Policy = { version: string; name: string; illustrative: boolean; rules: PolicyRule[] };

export const policy: Policy = {
  version: '2026-09-demo.1',
  name: 'Política de demostración — circulante pyme',
  illustrative: true,
  rules: [
    { id: 'min-vat-turnover', metric: 'vat_turnover_ttm', operator: 'gte', threshold: '250000', severity: 'hard', label: 'Facturación mínima declarada en IVA (12 meses)' },
    { id: 'max-leverage', metric: 'debt_to_ebitda', operator: 'lte', threshold: '3.5', severity: 'hard', label: 'Deuda financiera / EBITDA máxima' },
    { id: 'min-ebitda-margin', metric: 'ebitda_margin', operator: 'gte', threshold: '0.08', severity: 'borderline', label: 'Margen EBITDA mínimo' },
    { id: 'min-current-ratio', metric: 'current_ratio', operator: 'gte', threshold: '1.2', severity: 'borderline', label: 'Liquidez corriente mínima' },
    { id: 'max-vat-accounts-gap', metric: 'vat_accounts_gap', operator: 'lte', threshold: '0.10', severity: 'borderline', label: 'Desviación máxima entre IVA y cuentas anuales' },
    { id: 'min-quarter-stability', metric: 'quarterly_min_ratio', operator: 'gte', threshold: '0.6', severity: 'borderline', label: 'Estabilidad trimestral mínima (peor trimestre / media)' },
  ],
};
