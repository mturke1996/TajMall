import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * يستبدل رمز الاستعادة (code أو token_hash) بجلسة ثم يوجّه لصفحة كلمة المرور الجديدة.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = url.searchParams.get('next') ?? '/login/reset-password';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/login/reset-password';

  const code = url.searchParams.get('code');
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const supabase = createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error('auth callback code:', error.message);
    return NextResponse.redirect(
      `${origin}/login/reset-password?error=${encodeURIComponent(error.message)}`,
    );
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error('auth callback otp:', error.message);
    return NextResponse.redirect(
      `${origin}/login/reset-password?error=${encodeURIComponent(error.message)}`,
    );
  }

  // لا code ولا token_hash — قد يكون الرابط hash-only؛ وجّه للصفحة لتفعيله في المتصفح
  if (url.searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login/reset-password${url.search}`);
  }

  return NextResponse.redirect(`${origin}/login/reset-password?error=missing_token`);
}
