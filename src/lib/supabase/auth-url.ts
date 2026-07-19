import { getAuthRedirectOrigin } from '@/lib/app-url';

/** @deprecated استخدم getAuthRedirectOrigin — kept for imports */
export function getAppOrigin(): string {
  return getAuthRedirectOrigin();
}

const RESET_NEXT = '/login/reset-password';

/** وجهة redirectTo في resetPasswordForEmail — تُفعَّل الجلسة على الخادم في /auth/confirm */
export function resetPasswordRedirectUrl(): string {
  const origin = getAuthRedirectOrigin();
  return `${origin}/auth/confirm?next=${encodeURIComponent(RESET_NEXT)}`;
}

export function passwordResetLandingPath(): string {
  return RESET_NEXT;
}
