import { SignJWT, jwtVerify } from 'jose';

// A single shared demo password, no user accounts. The cookie only proves the password was entered.
export const SESSION_COOKIE = 'opsi_demo_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function secretKey(secret = process.env.SESSION_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(secret?: string): Promise<string> {
  return new SignJWT({ demo: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey(secret));
}

export async function isValidSessionToken(token: string | undefined, secret?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ['HS256'] });
    return payload.demo === true;
  } catch {
    return false;
  }
}

// Constant-time comparison so the password check doesn't leak length/prefix timing.
export function passwordMatches(input: string, expected = process.env.DEMO_PASSWORD): boolean {
  if (!expected) return false;
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
