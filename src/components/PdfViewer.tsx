'use client';
import { useEffect, useRef, useState } from 'react';
import { locateQuote, type PageText } from '@/lib/quote-locator';

// Legacy build: the modern build relies on very recent JS APIs (e.g. Map.getOrInsertComputed).
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type RenderedPage = {
  page: number; width: number; height: number;
  items: { str: string; hasEOL: boolean; rect: { left: number; top: number; width: number; height: number } }[];
};

export type HighlightStatus = { state: 'idle' } | { state: 'found'; page: number; onStatedPage: boolean } | { state: 'not_found' };

let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').then(mod => {
    mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return mod;
  });
  return pdfjsPromise;
}

// Renders every page to a canvas and keeps the text items' positions, so a quote can be
// located (see lib/quote-locator) and highlighted with overlay boxes.
export default function PdfViewer({ url, quote, page, onStatus }: {
  url: string; quote: string | null; page: number | null; onStatus?: (s: HighlightStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{ page: number; indices: number[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    setPages([]); setError(null); setHighlight(null); canvases.current.clear();
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        const targetWidth = Math.max(320, (container?.clientWidth ?? 600) - 16);
        const rendered: RenderedPage[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const p = await doc.getPage(n);
          const base = p.getViewport({ scale: 1 });
          const viewport = p.getViewport({ scale: targetWidth / base.width });
          const canvas = document.createElement('canvas');
          const ratio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          await p.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
          const content = await p.getTextContent();
          const items = content.items.flatMap(item => {
            if (!('str' in item)) return [];
            const tx = pdfjs.Util.transform(viewport.transform, item.transform);
            const h = Math.hypot(tx[2]!, tx[3]!);
            return [{ str: item.str, hasEOL: item.hasEOL, rect: { left: tx[4]!, top: tx[5]! - h, width: item.width * viewport.scale, height: h * 1.2 } }];
          });
          if (cancelled) return;
          rendered.push({ page: n, width: viewport.width, height: viewport.height, items });
          canvases.current.set(n, canvas);
        }
        if (!cancelled) setPages(rendered);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('No se pudo mostrar el PDF.');
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!pages.length || !quote) { setHighlight(null); onStatus?.({ state: 'idle' }); return; }
    const text: PageText[] = pages.map(p => ({ page: p.page, items: p.items }));
    const match = locateQuote(text, quote, page);
    if (!match) { setHighlight(null); onStatus?.({ state: 'not_found' }); return; }
    setHighlight({ page: match.page, indices: match.itemIndices });
    onStatus?.({ state: 'found', page: match.page, onStatedPage: match.onStatedPage });
    const target = pages.find(p => p.page === match.page);
    const el = pageRefs.current.get(match.page);
    const first = target?.items[match.itemIndices[0]!];
    if (el && first && containerRef.current) {
      const top = el.offsetTop + first.rect.top - containerRef.current.clientHeight / 3;
      containerRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    // onStatus is intentionally not a dependency: callers pass an inline function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, quote, page]);

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-slate-200 p-2" data-testid="pdf-viewer">
      {error && <p className="p-4 text-sm text-bad">{error}</p>}
      {!error && !pages.length && <p className="p-4 text-sm text-muted">Cargando documento…</p>}
      {pages.map(p => (
        <div key={p.page} ref={el => { if (el) pageRefs.current.set(p.page, el); }}
          className="relative mx-auto mb-2 bg-white shadow" style={{ width: p.width, height: p.height }} data-page={p.page}>
          <CanvasSlot canvas={canvases.current.get(p.page)} />
          {highlight?.page === p.page && highlight.indices.map(i => {
            const r = p.items[i]?.rect;
            return r ? <div key={i} className="pointer-events-none absolute rounded-sm bg-yellow-300/50 ring-2 ring-yellow-500"
              data-testid="pdf-highlight"
              style={{ left: r.left - 2, top: r.top - 1, width: r.width + 4, height: r.height }} /> : null;
          })}
          <span className="absolute bottom-1 right-2 text-[10px] text-slate-400">p. {p.page}</span>
        </div>
      ))}
    </div>
  );
}

function CanvasSlot({ canvas }: { canvas: HTMLCanvasElement | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && canvas && canvas.parentElement !== ref.current) ref.current.replaceChildren(canvas);
  }, [canvas]);
  return <div ref={ref} />;
}
