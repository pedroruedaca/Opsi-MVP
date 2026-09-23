'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// POSTs to a case action endpoint (run analysis, reopen review) and refreshes the page.
export default function CaseActionButton({ url, label, busyLabel, reasonLabel, next, variant = 'primary' }: {
  url: string; label: string; busyLabel: string; reasonLabel?: string; next?: string; variant?: 'primary' | 'secondary';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reasonLabel ? { reason } : {}) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'No se pudo completar la acción.');
      setOpen(false); setReason('');
      if (next) router.push(next); else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  const cls = variant === 'primary'
    ? 'rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60'
    : 'rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:border-slate-400 disabled:opacity-60';
  if (reasonLabel && !open) return <button onClick={() => setOpen(true)} className={cls}>{label}</button>;
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void run(); }}>
      {reasonLabel && <input autoFocus required value={reason} onChange={e => setReason(e.target.value)} aria-label={reasonLabel} placeholder={reasonLabel}
        className="min-w-64 flex-1 rounded-md border border-line px-3 py-1.5 text-sm" />}
      <button disabled={busy} className={cls}>{busy ? busyLabel : label}</button>
      {reasonLabel && <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">Cancelar</button>}
      {error && <p role="alert" className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}
