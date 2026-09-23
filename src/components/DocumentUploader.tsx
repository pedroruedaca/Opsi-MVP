'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_UPLOAD_BYTES, documentTypeLabels, documentTypes, guessDocumentMeta, isValidPeriod, type DocumentType } from '@/lib/documents';

type Item = {
  key: string; file: File; type: DocumentType | ''; period: string;
  state: 'ready' | 'uploading' | 'done' | 'error'; error?: string;
};

function clientError(item: Item): string | null {
  if (!item.file.name.toLowerCase().endsWith('.pdf')) return 'Solo se admiten archivos PDF.';
  if (item.file.size === 0) return 'El archivo está vacío.';
  if (item.file.size > MAX_UPLOAD_BYTES) return 'El archivo supera el máximo de 10 MB.';
  if (!item.type) return 'Elige el tipo de documento.';
  if (!isValidPeriod(item.type, item.period)) return item.type === 'modelo_303' ? 'Periodo: AAAA-Q1…Q4 (p. ej. 2025-Q3).' : 'Periodo: año fiscal AAAA.';
  return null;
}

export default function DocumentUploader({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(new Set<string>());

  function addFiles(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files).map((file): Item => {
      const guess = guessDocumentMeta(file.name);
      return { key: crypto.randomUUID(), file, type: guess.type ?? '', period: guess.period, state: 'ready' };
    });
    setItems(prev => [...prev, ...added]);
  }
  const update = (key: string, patch: Partial<Item>) => setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));

  async function upload(item: Item) {
    const problem = clientError(item);
    if (problem) { update(item.key, { state: 'error', error: problem }); return; }
    if (inFlight.current.has(item.key)) return;
    inFlight.current.add(item.key);
    update(item.key, { state: 'uploading', error: undefined });
    try {
      const body = new FormData();
      body.set('file', item.file); body.set('type', item.type); body.set('period', item.period);
      const res = await fetch(`/api/cases/${caseId}/documents`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo subir el archivo.');
      update(item.key, { state: 'done' });
      router.refresh();
    } catch (e) {
      update(item.key, { state: 'error', error: e instanceof Error ? e.message : 'No se pudo subir el archivo.' });
    } finally {
      inFlight.current.delete(item.key);
    }
  }

  const pending = items.filter(i => i.state !== 'done');
  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm transition ${dragging ? 'border-brand bg-blue-50' : 'border-line bg-surface hover:border-slate-400'}`}
      >
        <p className="font-medium">Arrastra aquí los PDF o haz clic para elegirlos</p>
        <p className="mt-1 text-muted">Modelo 303 trimestral y cuentas anuales · solo PDF · máx. 10 MB</p>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {pending.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {pending.map(item => (
            <li key={item.key} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-40 flex-1 truncate font-medium" title={item.file.name}>{item.file.name}</span>
              <select value={item.type} disabled={item.state === 'uploading'} aria-label="Tipo de documento"
                onChange={e => update(item.key, { type: e.target.value as DocumentType, state: 'ready', error: undefined })}
                className="rounded-md border border-line bg-white px-2 py-1.5">
                <option value="">Tipo…</option>
                {documentTypes.map(t => <option key={t} value={t}>{documentTypeLabels[t]}</option>)}
              </select>
              <input value={item.period} disabled={item.state === 'uploading'} aria-label="Periodo"
                placeholder={item.type === 'annual_accounts' ? '2025' : '2025-Q3'}
                onChange={e => update(item.key, { period: e.target.value.toUpperCase(), state: 'ready', error: undefined })}
                className="num w-28 rounded-md border border-line bg-white px-2 py-1.5" />
              <button onClick={() => upload(item)} disabled={item.state === 'uploading'}
                className="rounded-md bg-brand px-3 py-1.5 font-medium text-white disabled:opacity-60">
                {item.state === 'uploading' ? 'Subiendo…' : item.state === 'error' ? 'Reintentar' : 'Subir'}
              </button>
              <button onClick={() => setItems(prev => prev.filter(i => i.key !== item.key))} disabled={item.state === 'uploading'}
                className="text-muted hover:text-ink" aria-label="Quitar">✕</button>
              {item.error && <p role="alert" className="w-full text-bad">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
