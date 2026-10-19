/**
 * A redirect target taken from a query string (`?next=`) or from data a user can write (a notification's
 * link) must stay inside this app. The check below resolves the value the way a browser does and accepts
 * it only when the result is still a path on this origin, because a pattern test misses what the URL
 * parser does: it deletes tabs and newlines anywhere in the input, so "/<TAB>/evil.com" becomes
 * "//evil.com", another site. Pure and safe to import from client or server code.
 */

const PLACEHOLDER_ORIGIN = 'https://app.invalid';

/**
 * Returns `raw` as a normalised in-app path ("/dashboard", "/transactions?highlight=…#x"), or `fallback`
 * when it is empty, absolute, protocol-relative, contains a backslash, a control character or a space,
 * or is long enough to be abuse.
 */
export function safeInternalPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  if (raw[0] !== '/' || raw[1] === '/') return fallback;
  // C0 controls, space and DEL (the parser would drop some of them silently), and the backslash that
  // browsers read as a slash
  if (/[\u0000- \u007f\\]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** True when `raw` is already a safe in-app path (no rewriting needed). */
export function isSafeInternalPath(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && safeInternalPath(raw, '') !== '';
}
