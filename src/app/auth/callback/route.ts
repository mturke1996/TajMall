import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** يستبدل رمز الاستعادة/الدعوة بجلسة ثم يوجّه للصفحة المطلوبة. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login/forgot-password?error=missing_code`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('auth callback:', error.message);
    return NextResponse.redirect(
      `${origin}/login/forgot-password?error=${encodeURIComponent(error.message)}`,
    );
  }

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return NextResponse.redirect(`${origin}${safeNext}`);
}
