// Minimal single-purpose PDF writer for the synthetic sample documents: A4 pages,
// Helvetica / Helvetica-Bold text (WinAnsi, so Spanish accents work) and horizontal rules.
// Text is written as real text objects so pdf.js can find it in the text layer.

export type PdfOp =
  | { kind: 'text'; x: number; y: number; text: string; size?: number; bold?: boolean; align?: 'left' | 'right' }
  | { kind: 'rule'; x1: number; x2: number; y: number };

const PAGE_W = 595;
const PAGE_H = 842;

// WinAnsi code points for the few non-Latin-1 characters the samples use; the file is written as Latin-1.
const WIN_ANSI: Record<string, string> = { '—': '\x97', '–': '\x96', '€': '\x80', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94' };

function escapeText(s: string): string {
  return s.replace(/[—–€‘’“”]/g, ch => WIN_ANSI[ch] ?? '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Helvetica average glyph width is ~0.5em; good enough to right-align numbers in fixture PDFs.
function approxWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[0-9]/.test(ch) ? 0.556 : /[.,\s]/.test(ch) ? 0.278 : 0.55;
  return w * size;
}

function pageStream(ops: PdfOp[]): string {
  const out: string[] = ['0.5 w'];
  for (const op of ops) {
    if (op.kind === 'rule') { out.push(`${op.x1} ${op.y} m ${op.x2} ${op.y} l S`); continue; }
    const size = op.size ?? 10;
    const x = op.align === 'right' ? op.x - approxWidth(op.text, size) : op.x;
    out.push(`BT /${op.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${op.y} Td (${escapeText(op.text)}) Tj ET`);
  }
  return out.join('\n');
}

export function buildPdf(pages: PdfOp[][], title: string): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };

  const catalogId = add('');
  const pagesId = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pageIds: number[] = [];
  for (const ops of pages) {
    const stream = pageStream(ops);
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = add(`<< /Title (${escapeText(title)}) /Producer (Opsi sample generator) >>`);

  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}

export const PAGE = { width: PAGE_W, height: PAGE_H };
