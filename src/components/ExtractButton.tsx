'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExtractButton({ documentId, label }: { documentId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo iniciar la extracción.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la extracción.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button onClick={start} disabled={busy} className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-slate-400 disabled:opacity-60">
        {busy ? 'Iniciando…' : label}
      </button>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
