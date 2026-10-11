import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'rfp_session';
export const SESSION_TTL_DAYS = 30;

/** 32 random bytes: unguessable, so the token itself is the credential. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores. A fast hash is fine here (unlike passwords):
 * the token is already 256 random bits, so there is nothing to brute-force.
 */
export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',        // page JavaScript can't read it, so an XSS bug can't steal it
    'SameSite=Lax',    // not sent on cross-site POSTs: blocks CSRF on our write endpoints
    ...(secure ? ['Secure'] : []),   // HTTPS only (off for http://localhost dev)
  ].join('; ');
}
