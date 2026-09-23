// Synthetic demo borrower. Every figure here is invented; the PDFs built from it are
// stamped "DOCUMENTO SINTÉTICO". Box (casilla) numbers are deliberately omitted until
// they are taken from the official AEAT Modelo 303 design (see CLAUDE.md, Phase 2).

export const borrower = {
  name: 'Talleres Ribera S.L.',
  nif: 'B00000000',
  address: 'Calle Ejemplo 1, 50001 Zaragoza',
  requestedAmount: '120000.00',
};

export type VatQuarter = {
  quarter: 1 | 2 | 3 | 4;
  // Taxable base per VAT rate charged on sales (IVA devengado).
  output: { rate: 21 | 10 | 4; base: number }[];
  // Deductible VAT on current domestic purchases (IVA soportado deducible).
  inputBase: number;
};

export const vatYear = 2025;
export const vatQuarters: VatQuarter[] = [
  { quarter: 1, output: [{ rate: 21, base: 280_000 }], inputBase: 190_000 },
  { quarter: 2, output: [{ rate: 21, base: 310_000 }, { rate: 10, base: 12_000 }], inputBase: 214_500 },
  { quarter: 3, output: [{ rate: 21, base: 265_000 }], inputBase: 181_200 },
  { quarter: 4, output: [{ rate: 21, base: 335_000 }], inputBase: 228_300 },
];

export const vatAmount = (base: number, rate: number) => Math.round(base * rate) / 100;

export const annualAccounts = {
  year: 2025,
  balance: {
    nonCurrentAssets: 350_000,
    inventories: 150_000,
    tradeReceivables: 210_000,
    cash: 120_000,
    equity: 300_000,
    longTermBankDebt: 250_000,
    shortTermBankDebt: 60_000,
    tradePayables: 220_000,
  },
  pnl: {
    revenue: 1_210_000,
    supplies: -760_000,
    personnel: -240_000,
    otherOperating: -60_000,
    depreciation: -35_000,
    financialExpenses: -18_000,
    incomeTax: -24_250,
  },
};

export function eurEs(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);
}
