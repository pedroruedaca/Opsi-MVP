// Checks that every cached sample extraction is valid and that each quote can be located in the
// actual sample PDF on its stated page — i.e. the demo highlights will work.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import type { DocumentType } from '@/lib/documents';
import { validateExtraction } from '@/lib/extraction';
import { locateQuote, type PageText } from '@/lib/quote-locator';
import { sampleExtractions } from './extractions';

async function pdfText(bytes: Uint8Array): Promise<PageText[]> {
  const doc = await getDocument({ data: bytes, verbosity: 0 }).promise;
  const pages: PageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push({ page: n, items: content.items.flatMap(i => ('str' in i ? [{ str: i.str, hasEOL: i.hasEOL }] : [])) });
  }
  return pages;
}

describe('sample extraction fixtures', () => {
  const entries = Object.entries(sampleExtractions);
  it('cover all five sample PDFs', () => expect(entries).toHaveLength(5));

  it.each(entries.map(([sha, f]) => [f.sample, sha, f] as const))('%s: valid, hash matches, quotes locatable', async (sample, sha, fixture) => {
    const bytes = new Uint8Array(await readFile(path.join(process.cwd(), 'samples', sample)));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
    const fields = validateExtraction(fixture.documentType as DocumentType, { isExpectedDocument: true, documentCheckReason: '', fields: fixture.fields });
    const pages = await pdfText(bytes);
    for (const f of fields) {
      const match = locateQuote(pages, f.quote, f.page);
      expect(match, `${f.key}: «${f.quote}»`).not.toBeNull();
      expect(match!.onStatedPage).toBe(true);
    }
  });
});
