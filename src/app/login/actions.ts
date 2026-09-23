'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, passwordMatches } from '@/lib/auth';

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = String(formData.get('password') ?? '');
  if (!passwordMatches(password)) return 'Contraseña incorrecta.';
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: SESSION_MAX_AGE_SECONDS,
  });
  const next = String(formData.get('next') ?? '/');
  // Only allow same-site relative redirects.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
