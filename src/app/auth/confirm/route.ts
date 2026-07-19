import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * يفعّل جلسة استعادة كلمة المرور على الخادم (cookies) — يدعم:
 * - token_hash + type (يعمل من أي متصفح/جهاز — بدون PKCE)
 * - code (PKCE — يعمل فقط إذا طُلب الرابط من نفس المتصفح)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = url.searchParams.get('next') ?? '/login/reset-password';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/login/reset-password';

  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');

  const supabase = createSupabaseServerClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error('auth/confirm otp:', error.message);
    return NextResponse.redirect(
      `${origin}/login/reset-password?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error('auth/confirm code:', error.message);
    return NextResponse.redirect(
      `${origin}/login/reset-password?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login/forgot-password?error=missing_token`);
}
