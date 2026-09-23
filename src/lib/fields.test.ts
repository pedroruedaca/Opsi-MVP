import { describe, expect, it } from 'vitest';
import { canonicalValue, fieldDefs, formatValue } from './fields';

describe('canonicalValue', () => {
  it.each([
    ['310.000,00', '310000.00'], ['310000', '310000.00'], ['-760.000,00', '-760000.00'], ['(760.000,00)', '-760000.00'],
    ['1.234,5', '1234.50'], ['0', '0.00'], ['-0,00', '0.00'], ['007', '7.00'],
  ])('amount %s → %s', (raw, out) => expect(canonicalValue('modelo_303', 'base_21', raw)).toBe(out));
  it.each(['', 'abc', '1,2,3', '12.3456', '1e5'])('rejects amount %s', raw => expect(canonicalValue('modelo_303', 'base_21', raw)).toBeNull());
  it('validates quarter, year and NIF', () => {
    expect(canonicalValue('modelo_303', 'quarter', '3')).toBe('3');
    expect(canonicalValue('modelo_303', 'quarter', '5')).toBeNull();
    expect(canonicalValue('annual_accounts', 'fiscal_year', '2025')).toBe('2025');
    expect(canonicalValue('annual_accounts', 'fiscal_year', '25')).toBeNull();
    expect(canonicalValue('modelo_303', 'nif', 'b-00000000')).toBe('B00000000');
    expect(canonicalValue('modelo_303', 'nif', 'B123')).toBeNull();
    expect(canonicalValue('modelo_303', 'unknown', '1')).toBeNull();
  });
  it('formats amounts in Spanish style', () => {
    expect(formatValue('modelo_303', 'base_21', '-1234567.50')).toBe('−1.234.567,50 €');
    expect(formatValue('modelo_303', 'base_21', null)).toBe('—');
    expect(formatValue('modelo_303', 'quarter', '3')).toBe('3');
  });
  it('gives every Modelo 303 amount field a casilla and keeps keys unique', () => {
    for (const defs of Object.values(fieldDefs)) expect(new Set(defs.map(d => d.key)).size).toBe(defs.length);
    expect(fieldDefs.modelo_303.filter(d => d.kind === 'amount').every(d => d.casilla)).toBe(true);
  });
});
