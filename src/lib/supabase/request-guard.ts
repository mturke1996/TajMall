import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Guards for route handlers (server only: it imports node:crypto).
 *
 * The auth cookies are SameSite=Lax, which already keeps a cross-site POST from carrying them. These
 * checks are the second layer for the state-changing admin routes (invite, reset password): a browser
 * always sends Origin on a cross-site POST and Sec-Fetch-Site on every request, so a request that
 * says it came from another site is refused even if a cookie rule changes later.
 */

/** The first value of a possibly comma-separated forwarded header, lower-cased. */
function firstHost(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim().toLowerCase();
  return first || null;
}

/**
 * True when the request comes from this site's own pages (or from a client that is not a browser and so
 * sends neither header: curl, the keepalive workflow). False for a request a browser marks as
 * cross-site, or whose Origin is not this host (including the opaque "null" origin).
 */
export function isSameOriginRequest(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;

  const origin = req.headers.get('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false; // "null" and anything that is not a URL
  }

  const own = new Set<string>();
  for (const h of [firstHost(req.headers.get('x-forwarded-host')), firstHost(req.headers.get('host'))]) {
    if (h) own.add(h);
  }
  try {
    own.add(new URL(req.url).host.toLowerCase());
  } catch {
    /* req.url is always absolute in a route handler */
  }
  return own.has(originHost);
}

/** True when the body is declared as JSON: a plain HTML form cannot send that without a CORS preflight. */
export function isJsonRequest(req: Request): boolean {
  return (req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');
}

/** Compares two secrets without leaking, through timing, how many leading characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** The token of an "Authorization: Bearer <token>" header, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  const m = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
