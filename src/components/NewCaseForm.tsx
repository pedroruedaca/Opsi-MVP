'use client';
import { useActionState, useState } from 'react';
import { createCaseAction } from '@/app/actions';

const input = 'mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-sm';

export default function NewCaseForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createCaseAction, { error: null });
  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Nuevo caso</button>;
  }
  return (
    <form action={action} className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-4 sm:items-end">
      <label className="text-sm font-medium sm:col-span-2">Prestatario
        <input name="borrowerName" required className={input} placeholder="Razón social" />
      </label>
      <label className="text-sm font-medium">NIF/CIF
        <input name="nif" required className={input + ' uppercase'} placeholder="B12345678" />
      </label>
      <label className="text-sm font-medium">Importe solicitado (EUR, opcional)
        <input name="requestedAmount" inputMode="decimal" className={input + ' num'} placeholder="100.000" />
      </label>
      {state.error && <p role="alert" className="text-sm text-bad sm:col-span-4">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-4">
        <button disabled={pending} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {pending ? 'Creando…' : 'Crear caso'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-line px-4 py-2 text-sm">Cancelar</button>
      </div>
    </form>
  );
}
