// Finds an extraction quote in a PDF's text layer so the viewer can highlight it.
// Pure and framework-free: the viewer passes pdf.js text items in, gets item indices back.

export type TextItem = { str: string; hasEOL?: boolean };
export type PageText = { page: number; items: TextItem[] };
export type QuoteMatch = { page: number; itemIndices: number[]; onStatedPage: boolean };

// Comparison ignores case, accents-as-composed-vs-decomposed, all whitespace, dash variants,
// soft hyphens and hyphenation at line ends, so "Base imponible al 21 % 310.000,00" matches the
// separate "Base imponible al 21 %" and "310.000,00" text items.
function normalizeChar(ch: string): string {
  if (/\s/.test(ch) || ch === '­') return '';
  if (/[‐‑‒–—−]/.test(ch)) return '-';
  return ch.normalize('NFKC').toLowerCase();
}

export function normalizeForMatch(text: string): string {
  return Array.from(text.replace(/-\s*\n\s*/g, ''), normalizeChar).join('');
}

function pageStream(items: TextItem[]): { text: string; owner: number[] } {
  let text = '';
  const owner: number[] = [];
  items.forEach((item, index) => {
    let str = item.str;
    // A word hyphenated across lines: drop the trailing hyphen so "factu-" + "ración" matches "facturación".
    const next = items[index + 1];
    if (/[a-záéíóúñ]-$/i.test(str) && item.hasEOL && next && /^[a-záéíóúñ]/i.test(next.str)) str = str.slice(0, -1);
    for (const ch of str) {
      const n = normalizeChar(ch);
      for (const c of n) { text += c; owner.push(index); }
    }
  });
  return { text, owner };
}

function findOnPage(items: TextItem[], needle: string): number[] | null {
  const { text, owner } = pageStream(items);
  const at = text.indexOf(needle);
  if (at < 0) return null;
  return [...new Set(owner.slice(at, at + needle.length))];
}

// Looks on the stated page first, then on the other pages (the quote is still the right text,
// the page number was just wrong). Returns null rather than a partial or fuzzy match.
export function locateQuote(pages: PageText[], quote: string, statedPage: number | null): QuoteMatch | null {
  const needle = normalizeForMatch(quote);
  if (needle.length < 3) return null;
  const ordered = [...pages].sort((a, b) => (a.page === statedPage ? -1 : b.page === statedPage ? 1 : a.page - b.page));
  for (const p of ordered) {
    const itemIndices = findOnPage(p.items, needle);
    if (itemIndices) return { page: p.page, itemIndices, onStatedPage: p.page === statedPage };
  }
  return null;
}
