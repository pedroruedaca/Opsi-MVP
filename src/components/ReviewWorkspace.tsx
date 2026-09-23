'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PdfViewer, { type HighlightStatus } from './PdfViewer';
import StatusBadge from './StatusBadge';

export type ReviewField = {
  id: string; key: string; label: string; casilla: string | null;
  extracted: string | null; extractedDisplay: string; confirmedDisplay: string;
  page: number | null; quote: string | null;
  status: 'proposed' | 'confirmed' | 'corrected'; reviewed: boolean; correctionReason: string | null;
};
export type ReviewDoc = {
  id: string; label: string; period: string; filename: string; status: string;
  source: string | null; model: string | null; warnings: string[]; fields: ReviewField[];
};

function outcomeLabel(f: ReviewField): { label: string; tone: 'neutral' | 'ok' | 'warn' } {
  if (!f.reviewed) return { label: 'Pendiente', tone: 'neutral' };
  if (f.confirmedDisplay === '—') return { label: 'Vacío', tone: 'warn' };
  return f.status === 'corrected' ? { label: 'Corregido', tone: 'warn' } : { label: 'Confirmado', tone: 'ok' };
}

export default function ReviewWorkspace({ docs, locked, initialFieldId = null }: { docs: ReviewDoc[]; locked: boolean; initialFieldId?: string | null }) {
  const router = useRouter();
  // A link from the analysis (?campo=<fieldId>) opens the review at that field, pinned.
  const linkedDoc = initialFieldId ? docs.find(d => d.fields.some(f => f.id === initialFieldId)) : undefined;
  const [docId, setDocId] = useState(linkedDoc?.id ?? docs.find(d => d.fields.some(f => !f.reviewed))?.id ?? docs[0]?.id);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(linkedDoc ? initialFieldId : null);
  const [editing, setEditing] = useState<{ id: string; mode: 'correct' | 'clear'; value: string; reason: string } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reopened, setReopened] = useState<string | null>(null);
  const [status, setStatus] = useState<HighlightStatus>({ state: 'idle' });
  const inFlight = useRef(false);

  const doc = docs.find(d => d.id === docId);
  if (!doc) return <p className="text-sm text-muted">No hay documentos listos para revisar.</p>;
  const activeId = hovered ?? pinned;
  const active = doc.fields.find(f => f.id === activeId) ?? null;
  const pending = doc.fields.filter(f => !f.reviewed).length;

  async function send(field: ReviewField, body: Record<string, string>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(field.id); setError(null);
    try {
      const res = await fetch(`/api/fields/${field.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar.');
      setEditing(null); setReopened(null);
      router.refresh();
    } catch (e) {
      setError({ id: field.id, message: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      inFlight.current = false; setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Documentos">
        {docs.map(d => {
          const left = d.fields.filter(f => !f.reviewed).length;
          return (
            <button key={d.id} role="tab" aria-selected={d.id === docId}
              onClick={() => { setDocId(d.id); setPinned(null); setHovered(null); setEditing(null); }}
              className={`rounded-md border px-3 py-1.5 text-sm ${d.id === docId ? 'border-brand bg-blue-50 font-medium text-brand' : 'border-line bg-surface hover:border-slate-400'}`}>
              {d.label} <span className="num">{d.period}</span>
              <span className={`ml-2 text-xs ${left ? 'text-warn' : 'text-ok'}`}>{left ? `${left} pendientes` : '✓'}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="h-[70vh] overflow-hidden rounded-lg border border-line lg:sticky lg:top-4">
          <PdfViewer url={`/api/documents/${doc.id}/file`} quote={active?.quote ?? null} page={active?.page ?? null} onStatus={setStatus} />
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{doc.filename}</span>
              {doc.source === 'cached'
                ? <StatusBadge label="Extracción en caché (muestra)" tone="info" />
                : <StatusBadge label={`Extraído con ${doc.model ?? 'IA'}`} tone="info" />}
              <span className="text-muted">{pending ? `${pending} de ${doc.fields.length} por revisar` : 'Todos los campos revisados'}</span>
            </div>
            {doc.warnings.map(w => <p key={w} className="mt-2 text-warn">⚠ {w}</p>)}
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              {active ? (!active.quote ? 'Sin cita: el valor no se encontró en el documento.' : status.state === 'found'
                ? (status.onStatedPage ? `Origen resaltado en la p. ${status.page}.` : `Cita encontrada en la p. ${status.page}, no en la p. ${active.page} indicada.`)
                : status.state === 'not_found' ? 'No se ha localizado la cita en el documento: compruébalo manualmente.' : '')
                : 'Pasa el ratón por un campo o haz clic para ver su origen en el documento.'}
            </p>
          </div>

          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {doc.fields.map(f => {
              const outcome = outcomeLabel(f);
              const isEditing = editing?.id === f.id;
              return (
                <li key={f.id} data-testid={`field-${f.key}`}
                  onMouseEnter={() => setHovered(f.id)} onMouseLeave={() => setHovered(null)}
                  onClick={() => setPinned(f.id)}
                  className={`px-4 py-3 text-sm ${activeId === f.id ? 'bg-yellow-50' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{f.casilla && <span className="num mr-1 text-muted">[{f.casilla}]</span>}{f.label}</p>
                      <p className="num mt-0.5 text-base">
                        {f.reviewed ? f.confirmedDisplay : f.extractedDisplay}
                        {f.reviewed && f.status === 'corrected' && <span className="ml-2 text-xs text-muted line-through">{f.extractedDisplay}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {f.extracted === null ? 'No encontrado en el documento' : `p. ${f.page} · «${f.quote}»`}
                      </p>
                      {f.correctionReason && <p className="text-xs text-muted">Motivo: {f.correctionReason}</p>}
                    </div>
                    <span data-testid="field-outcome"><StatusBadge label={outcome.label} tone={outcome.tone} /></span>
                  </div>

                  {!locked && !isEditing && f.reviewed && reopened !== f.id && (
                    <button onClick={e => { e.stopPropagation(); setReopened(f.id); }} className="mt-2 text-xs text-brand hover:underline">Cambiar</button>
                  )}
                  {!locked && !isEditing && (!f.reviewed || reopened === f.id) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {f.extracted !== null && (
                        <button disabled={busy === f.id} onClick={e => { e.stopPropagation(); void send(f, { action: 'confirm' }); }}
                          className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white disabled:opacity-60">Confirmar</button>
                      )}
                      <button onClick={e => { e.stopPropagation(); setEditing({ id: f.id, mode: 'correct', value: f.extracted ?? '', reason: '' }); }}
                        className="rounded-md border border-line px-3 py-1 text-xs">{f.extracted === null ? 'Introducir valor' : 'Corregir'}</button>
                      <button onClick={e => { e.stopPropagation(); if (f.extracted === null) void send(f, { action: 'clear' }); else setEditing({ id: f.id, mode: 'clear', value: '', reason: '' }); }}
                        disabled={busy === f.id} className="rounded-md border border-line px-3 py-1 text-xs">Dejar vacío</button>
                    </div>
                  )}

                  {isEditing && (
                    <form className="mt-2 grid gap-2 sm:grid-cols-2" onClick={e => e.stopPropagation()}
                      onSubmit={e => { e.preventDefault(); void send(f, editing.mode === 'correct' ? { action: 'correct', value: editing.value, reason: editing.reason } : { action: 'clear', reason: editing.reason }); }}>
                      {editing.mode === 'correct' && (
                        <input autoFocus value={editing.value} onChange={e => setEditing({ ...editing, value: e.target.value })}
                          aria-label="Valor correcto" placeholder="Valor" className="num rounded-md border border-line px-2 py-1.5" />
                      )}
                      <input value={editing.reason} onChange={e => setEditing({ ...editing, reason: e.target.value })} required
                        aria-label="Motivo" placeholder={editing.mode === 'correct' ? 'Motivo de la corrección' : 'Motivo para descartar el valor'}
                        className={`rounded-md border border-line px-2 py-1.5 ${editing.mode === 'clear' ? 'sm:col-span-2' : ''}`} />
                      <div className="flex gap-2 sm:col-span-2">
                        <button disabled={busy === f.id} className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white disabled:opacity-60">Guardar</button>
                        <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-line px-3 py-1 text-xs">Cancelar</button>
                      </div>
                    </form>
                  )}
                  {error?.id === f.id && <p role="alert" className="mt-1 text-xs text-bad">{error.message}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
