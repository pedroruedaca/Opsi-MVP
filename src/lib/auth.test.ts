import { describe, expect, it } from 'vitest';
import { createSessionToken, isValidSessionToken, passwordMatches } from './auth';

const secret = 'test-secret-test-secret-test-secret-123';

describe('demo auth', () => {
  it('round-trips a signed session token', async () => {
    const token = await createSessionToken(secret);
    expect(await isValidSessionToken(token, secret)).toBe(true);
  });
  it('rejects missing, tampered and wrongly signed tokens', async () => {
    const token = await createSessionToken(secret);
    expect(await isValidSessionToken(undefined, secret)).toBe(false);
    expect(await isValidSessionToken(token.slice(0, -2) + 'xx', secret)).toBe(false);
    expect(await isValidSessionToken(token, secret.replace('1', '9'))).toBe(false);
  });
  it('refuses short secrets', async () => {
    await expect(createSessionToken('short')).rejects.toThrow(/32/);
  });
  it('compares passwords exactly and fails closed without a configured password', () => {
    expect(passwordMatches('abc', 'abc')).toBe(true);
    expect(passwordMatches('abcd', 'abc')).toBe(false);
    expect(passwordMatches('', 'abc')).toBe(false);
    expect(passwordMatches('abc', undefined)).toBe(false);
  });
});
