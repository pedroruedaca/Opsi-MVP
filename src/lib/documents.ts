import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const documentTypes = ['modelo_303', 'annual_accounts'] as const;
export type DocumentType = typeof documentTypes[number];

export const documentTypeLabels: Record<DocumentType, string> = {
  modelo_303: 'Modelo 303 (IVA trimestral)',
  annual_accounts: 'Cuentas anuales',
};

export const extractionStatusLabels = {
  pending: 'Subido',
  extracting: 'Extrayendo',
  needs_review: 'Pendiente de revisión',
  confirmed: 'Confirmado',
  failed: 'Error',
} as const;

export const caseStatusLabels = {
  draft: 'Borrador',
  in_review: 'En revisión',
  analysed: 'Analizado',
  decided: 'Decidido',
} as const;

// Modelo 303 periods are quarters ("2025-Q3"); annual accounts are fiscal years ("2025").
const quarterPeriod = /^(19|20)\d{2}-Q[1-4]$/;
const yearPeriod = /^(19|20)\d{2}$/;

export function isValidPeriod(type: DocumentType, period: string): boolean {
  return type === 'modelo_303' ? quarterPeriod.test(period) : yearPeriod.test(period);
}

export const uploadMetadataSchema = z.object({
  type: z.enum(documentTypes),
  period: z.string().trim(),
}).refine(v => isValidPeriod(v.type, v.period), {
  message: 'Periodo no válido: usa AAAA-T1…T4 para Modelo 303 (p. ej. 2025-Q3) o AAAA para cuentas anuales.',
  path: ['period'],
});

export class UploadValidationError extends Error {}

// Validates the uploaded bytes themselves rather than trusting the browser-reported MIME type.
export function validatePdfUpload(filename: string, bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new UploadValidationError('El archivo está vacío.');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new UploadValidationError('El archivo supera el máximo de 10 MB.');
  if (!filename.toLowerCase().endsWith('.pdf')) throw new UploadValidationError('Solo se admiten archivos PDF.');
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 5));
  if (header !== '%PDF-') throw new UploadValidationError('El archivo no es un PDF válido.');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'documento.pdf';
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'documento.pdf';
}

// Accepts Spanish ("100.000,50", "100.000") and plain ("100000.50") amounts; returns a plain decimal string.
export function normalizeAmount(input: string): string {
  const v = input.replace(/\s|€/g, '');
  if (v.includes(',')) return v.replace(/\./g, '').replace(',', '.');
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) return v.replace(/\./g, '');
  return v;
}

export const createCaseSchema = z.object({
  borrowerName: z.string().trim().min(2, 'Indica el nombre del prestatario.').max(200),
  nif: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{9}$/, 'El NIF/CIF debe tener 9 caracteres alfanuméricos.'),
  requestedAmount: z.string().trim()
    .transform(normalizeAmount)
    .refine(v => v === '' || /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Importe no válido.')
    .transform(v => (v === '' ? null : v)),
});

// Pre-fills the upload form from the filename ("303_2025_3T.pdf", "cuentas-anuales-2024.pdf").
// Only a suggestion: the analyst always confirms type and period before uploading.
export function guessDocumentMeta(filename: string): { type: DocumentType | null; period: string } {
  const name = filename.toLowerCase();
  const year = name.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/)?.[1] ?? '';
  const is303 = /(?:^|\D)303(?:\D|$)/.test(name) || name.includes('iva');
  const isAccounts = /cuentas|balance|anual|pyg|p&g/.test(name);
  if (is303) {
    const quarter = name.match(/(?:^|[^a-z0-9])(?:q|t)([1-4])(?:\D|$)/)?.[1]
      ?? name.match(/(?:^|\D)([1-4])\s*(?:t|q|trim)/)?.[1];
    return { type: 'modelo_303', period: year && quarter ? `${year}-Q${quarter}` : year ? `${year}-Q` : '' };
  }
  if (isAccounts) return { type: 'annual_accounts', period: year };
  return { type: null, period: year };
}
