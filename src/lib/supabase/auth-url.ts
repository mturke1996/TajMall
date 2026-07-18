/** Origin used for Supabase auth redirects (reset password, invites, etc.). */
export function getAppOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function resetPasswordRedirectUrl(): string {
  return `${getAppOrigin()}/auth/callback?next=${encodeURIComponent('/login/reset-password')}`;
}
