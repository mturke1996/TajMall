import { getAuthRedirectOrigin } from '@/lib/app-url';

/** @deprecated استخدم getAuthRedirectOrigin — kept for imports */
export function getAppOrigin(): string {
  return getAuthRedirectOrigin();
}

export function resetPasswordRedirectUrl(): string {
  // Supabase يُلحق token_hash&type=recovery أو code — نعالجهما في /login/reset-password
  return `${getAuthRedirectOrigin()}/login/reset-password`;
}
