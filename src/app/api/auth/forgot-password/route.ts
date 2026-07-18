import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resetPasswordRedirectUrl } from '@/lib/supabase/auth-url';

const schema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح'),
});

/**
 * إرسال رابط استعادة كلمة المرور — يُنفَّذ على الخادم لضمان
 * redirectTo = https://taj-mall-nu.vercel.app وليس localhost.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'بيانات غير صالحة';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const redirectTo = resetPasswordRedirectUrl();
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    console.error('forgot-password redirectTo=', redirectTo, 'error=', error.message);
  }

  // لا نكشف إن كان البريد مسجّلاً أم لا
  return NextResponse.json({ ok: true });
}
