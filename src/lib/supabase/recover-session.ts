import type { SupabaseClient } from '@supabase/supabase-js';

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
    if (access_token && hashType === 'recovery') {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token ?? '',
      });
      if (error) return { ok: false, reason: error.message };
      stripRecoveryParamsFromUrl();
      return { ok: true };
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return { ok: true };

  return { ok: false, reason: 'missing_token' };
}

function stripRecoveryParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  url.hash = '';
  window.history.replaceState({}, '', url.pathname + (url.search || ''));
}
