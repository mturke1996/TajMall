import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resetPasswordRedirectUrl } from '@/lib/supabase/auth-url';

const schema = z.object({
  email: z.string('أدخل البريد الإلكتروني').trim().max(254, 'بريد إلكتروني غير صالح').pipe(z.email('بريد إلكتروني غير صالح')),
});

/**
 * إرسال رابط استعادة كلمة المرور — يُنفَّذ على الخادم لضمان
 * redirectTo = https://taj-mall-nu.vercel.app وليس localhost.
 */
// NOTE: the "forgot password" screen does not call this route today: it asks for the link from the browser
// (PKCE keeps its code verifier in the browser's own cookies). The route stays public; delete it if it
// is not going to be used. The reply never says whether an address is registered, but the response time can
// (sending a real message is slower than not sending one): that is Supabase's behaviour, not hidden here.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'بيانات غير صالحة';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const redirectTo = resetPasswordRedirectUrl();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    console.error('forgot-password redirectTo=', redirectTo, 'error=', error.message);
  }

  // لا نكشف إن كان البريد مسجّلاً أم لا
  return NextResponse.json({ ok: true });
}
