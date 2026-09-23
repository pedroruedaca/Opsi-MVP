import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPdf } from './pdf';

describe('buildPdf', () => {
  it('writes a PDF whose text (including accents and dashes) pdf.js can read', async () => {
    const bytes = buildPdf([[{ kind: 'text', x: 50, y: 700, text: 'Cuota al 21 % — Liquidación (1.234,56)' }]], 'Prueba');
    expect(new TextDecoder('latin1').decode(bytes.subarray(0, 5))).toBe('%PDF-');
    const doc = await getDocument({ data: bytes, verbosity: 0 }).promise;
    const content = await (await doc.getPage(1)).getTextContent();
    const text = content.items.map(i => ('str' in i ? i.str : '')).join('');
    expect(text).toBe('Cuota al 21 % — Liquidación (1.234,56)');
  });
});
