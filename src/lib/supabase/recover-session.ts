import type { SupabaseClient } from '@supabase/supabase-js';
import { RECOVERY_COOKIE, RESET_PATH } from '@/lib/supabase/recovery-cookie';

export type RecoveryExchangeResult =
  | { ok: true }
  | { ok: false; reason: string; redirecting?: boolean };

/**
 * إن وُجد code/token_hash في الرابط، نوجّه لـ /auth/confirm (خادم + cookies).
 * لا نستدعي exchangeCodeForSession في المتصفح — يسبب خطأ PKCE.
 */
export async function exchangePasswordRecoverySession(
  supabase: SupabaseClient,
): Promise<RecoveryExchangeResult> {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'server' };
  }

  const search = new URLSearchParams(window.location.search);
  // arriving from /auth/confirm or /auth/callback, which have just exchanged an emailed token for this
  // session and left a short-lived cookie that only they set
  if (takeRecoveryCookie()) {
    markRecovery();
    stripRecoveryParamsFromUrl();
    return { ok: true };
  }
  const code = search.get('code');
  const token_hash = search.get('token_hash');
  const type = search.get('type');

  if (code || (token_hash && type)) {
    const params = new URLSearchParams(window.location.search);
    params.set('next', '/login/reset-password');
    window.location.replace(`/auth/confirm?${params.toString()}`);
    return { ok: false, reason: 'redirecting', redirecting: true };
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  if (hash.includes('access_token=')) {
    const hashParams = new URLSearchParams(hash);
    const access_token = hashParams.get('access_token');
    const refresh_token = hashParams.get('refresh_token');
    const hashType = hashParams.get('type');
    // "recovery" (forgot password) and "invite" (a new user setting their first password)
    if (access_token && (hashType === 'recovery' || hashType === 'invite')) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token ?? '',
      });
      if (error) return { ok: false, reason: error.message };
      markRecovery();
      stripRecoveryParamsFromUrl();
      return { ok: true };
    }
  }

  // An ordinary signed-in session is not enough: anyone at an unlocked browser could then set a new
  // password without the current one. Only a session created from a link in this tab counts.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && hasRecovery()) return { ok: true };
  if (session) return { ok: false, reason: 'signed_in' };

  return { ok: false, reason: 'missing_token' };
}

const RECOVERY_KEY = 'pw-recovery-at';

/** Reads the cookie the confirm routes set (15 minutes) and removes it: it is good for one arrival. */
function takeRecoveryCookie() {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${RECOVERY_COOKIE}=`))
    ?.slice(RECOVERY_COOKIE.length + 1);
  if (!raw) return false;
  document.cookie = `${RECOVERY_COOKIE}=; Max-Age=0; Path=${RESET_PATH}; SameSite=Lax`;
  const at = Number(raw);
  return Number.isFinite(at) && Date.now() - at < 15 * 60_000;
}

function markRecovery() {
  try {
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    /* private mode: the page still works for this load */
  }
}

/** A recovery started in this tab within the last 30 minutes. */
function hasRecovery() {
  try {
    const at = Number(sessionStorage.getItem(RECOVERY_KEY));
    return Number.isFinite(at) && Date.now() - at < 30 * 60_000;
  } catch {
    return false;
  }
}

export function clearRecovery() {
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* ignore */
  }
}

function stripRecoveryParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  url.searchParams.delete('recovery');
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + (url.search || ''));
}
