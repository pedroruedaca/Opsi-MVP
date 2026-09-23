import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES, UploadValidationError, createCaseSchema, guessDocumentMeta, isValidPeriod,
  normalizeAmount, safeFilename, sha256Hex, uploadMetadataSchema, validatePdfUpload,
} from './documents';

const pdf = (extra = 'x') => new TextEncoder().encode('%PDF-1.4\n' + extra);

describe('validatePdfUpload', () => {
  it('accepts a PDF by its magic bytes', () => {
    expect(() => validatePdfUpload('a.pdf', pdf())).not.toThrow();
  });
  it('rejects empty, oversized, wrong extension and non-PDF content', () => {
    expect(() => validatePdfUpload('a.pdf', new Uint8Array())).toThrow(UploadValidationError);
    expect(() => validatePdfUpload('a.pdf', new Uint8Array(MAX_UPLOAD_BYTES + 1))).toThrow(/10 MB/);
    expect(() => validatePdfUpload('a.docx', pdf())).toThrow(/PDF/);
    expect(() => validatePdfUpload('a.pdf', new TextEncoder().encode('<html>'))).toThrow(/no es un PDF/);
  });
});

describe('periods', () => {
  it('requires quarters for Modelo 303 and years for annual accounts', () => {
    expect(isValidPeriod('modelo_303', '2025-Q3')).toBe(true);
    expect(isValidPeriod('modelo_303', '2025')).toBe(false);
    expect(isValidPeriod('modelo_303', '2025-Q5')).toBe(false);
    expect(isValidPeriod('annual_accounts', '2025')).toBe(true);
    expect(isValidPeriod('annual_accounts', '2025-Q1')).toBe(false);
  });
  it('rejects mismatched upload metadata with a Spanish message', () => {
    const r = uploadMetadataSchema.safeParse({ type: 'annual_accounts', period: '2025-Q1' });
    expect(r.success).toBe(false);
    expect(uploadMetadataSchema.safeParse({ type: 'other', period: '2025' }).success).toBe(false);
  });
});

describe('guessDocumentMeta', () => {
  it.each([
    ['modelo-303_2025_3T.pdf', 'modelo_303', '2025-Q3'],
    ['303 2024 Q1.pdf', 'modelo_303', '2024-Q1'],
    ['IVA_2025_T2.pdf', 'modelo_303', '2025-Q2'],
    ['cuentas-anuales_2024.pdf', 'annual_accounts', '2024'],
    ['scan0001.pdf', null, ''],
  ])('%s', (name, type, period) => {
    expect(guessDocumentMeta(name)).toEqual({ type, period });
  });
});

describe('amounts and case input', () => {
  it.each([['100.000', '100000'], ['100.000,50', '100000.50'], ['100000.50', '100000.50'], ['1.5', '1.5'], ['', '']])(
    'normalizes %s', (input, out) => expect(normalizeAmount(input)).toBe(out));
  it('validates and normalizes a new case', () => {
    expect(createCaseSchema.parse({ borrowerName: ' Acme S.L. ', nif: 'b12345678', requestedAmount: '120.000' }))
      .toEqual({ borrowerName: 'Acme S.L.', nif: 'B12345678', requestedAmount: '120000' });
    expect(createCaseSchema.parse({ borrowerName: 'Acme', nif: 'B12345678', requestedAmount: '' }).requestedAmount).toBeNull();
    expect(createCaseSchema.safeParse({ borrowerName: 'Acme', nif: '123', requestedAmount: '' }).success).toBe(false);
    expect(createCaseSchema.safeParse({ borrowerName: 'Acme', nif: 'B12345678', requestedAmount: 'abc' }).success).toBe(false);
  });
});

describe('files', () => {
  it('hashes bytes as lowercase hex SHA-256', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('strips paths and unsafe characters from filenames', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\x\\Balance "2025".pdf')).toBe('Balance _2025_.pdf');
  });
});
