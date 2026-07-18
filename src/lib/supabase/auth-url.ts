import { getAuthRedirectOrigin } from '@/lib/app-url';

/** @deprecated استخدم getAuthRedirectOrigin — kept for imports */
export function getAppOrigin(): string {
  return getAuthRedirectOrigin();
}

export function resetPasswordRedirectUrl(): string {
  return `${getAuthRedirectOrigin()}/auth/callback?next=${encodeURIComponent('/login/reset-password')}`;
}
