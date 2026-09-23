import { describe, expect, it } from 'vitest';
import { locateQuote, normalizeForMatch } from './quote-locator';

const pages = [
  { page: 1, items: [{ str: 'NIF: B00000000', hasEOL: true }, { str: '[07] Base imponible al 21 %' }, { str: '310.000,00', hasEOL: true }] },
  { page: 2, items: [{ str: '1. Importe neto de la cifra de ' }, { str: 'nego-', hasEOL: true }, { str: 'cios' }, { str: '1.210.000,00' }] },
];

describe('locateQuote', () => {
  it('matches an exact quote spanning label and amount items', () => {
    expect(locateQuote(pages, '[07] Base imponible al 21 % 310.000,00', 1)).toEqual({ page: 1, itemIndices: [1, 2], onStatedPage: true });
  });
  it('ignores whitespace, case and dash differences', () => {
    expect(locateQuote(pages, '[07]  BASE imponible al 21 %\n310.000,00', 1)?.itemIndices).toEqual([1, 2]);
    expect(normalizeForMatch('Modelo 303 — IVA')).toBe(normalizeForMatch('modelo 303 - iva'));
  });
  it('handles words hyphenated across lines', () => {
    expect(locateQuote(pages, 'Importe neto de la cifra de negocios 1.210.000,00', 2)?.itemIndices).toEqual([0, 1, 2, 3]);
  });
  it('falls back to another page when the stated page is wrong, and says so', () => {
    expect(locateQuote(pages, 'NIF: B00000000', 2)).toEqual({ page: 1, itemIndices: [0], onStatedPage: false });
  });
  it('returns null instead of a partial or fuzzy match', () => {
    expect(locateQuote(pages, 'Base imponible al 21 % 320.000,00', 1)).toBeNull();
    expect(locateQuote(pages, 'xy', 1)).toBeNull();
    expect(locateQuote(pages, 'Total cuota devengada', 1)).toBeNull();
  });
});
