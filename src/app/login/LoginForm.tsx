'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium">
        Contraseña de demostración
        <input name="password" type="password" required autoFocus
          className="mt-1 block w-full rounded-md border border-line bg-white px-3 py-2 text-base" />
      </label>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
