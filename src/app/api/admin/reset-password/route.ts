import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/permissions';
import { isJsonRequest, isSameOriginRequest } from '@/lib/supabase/request-guard';

const schema = z.object({
  user_id: z.uuid('معرّف مستخدم غير صالح'),
  // 72 is the most the auth service hashes (bcrypt)
  password: z
    .string('كلمة المرور مطلوبة')
    .min(10, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل')
    .max(72, 'كلمة المرور يجب ألا تزيد على 72 حرفاً'),
});

/**
 * يعيّن كلمة مرور جديدة لمستخدم دون الحاجة للكلمة القديمة.
 *
 * للمالك (owner) وحده. كان المدير (admin) يستطيع أيضاً تعيين كلمة مرور مدير آخر من نفس مرتبته: أي
 * أن مديراً واحداً يستولي على حساب مدير ثانٍ ويعمل باسمه بلا أثر في أي سجل. الشاشة لا تعرض الزر
 * إلا للمالك، والخادم الآن يفرض القاعدة نفسها، فلا يتجاوزها من يستدعي الواجهة مباشرة.
 * الدور يُقرأ من قاعدة البيانات بجلسة المستدعي، لا من أي ادّعاء في الطلب.
 */
export async function POST(req: Request) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: 'طلب مرفوض' }, { status: 403 });
    }
    if (!isJsonRequest(req)) {
      return NextResponse.json({ error: 'نوع الطلب غير مدعوم' }, { status: 415 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    const callerRole = normalizeRole(callerProfile?.role);
    if (callerRole !== 'owner') {
      return NextResponse.json(
        { error: 'غير مصرّح — تعيين كلمة مرور حساب آخر للمالك (owner) فقط' },
        { status: 403 },
      );
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'بيانات غير صالحة';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { user_id, password } = parsed.data;

    if (user_id === caller.id) {
      return NextResponse.json(
        { error: 'لحسابك استخدم «نسيت كلمة المرور» من صفحة الدخول' },
        { status: 400 },
      );
    }

    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      return NextResponse.json(
        { error: 'مفتاح الخدمة غير مضبوط على الخادم' },
        { status: 503 },
      );
    }

    const { data: targetProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .maybeSingle();

    if (profileErr || !targetProfile) {
      return NextResponse.json({ error: 'لم يُعثر على المستخدم' }, { status: 404 });
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(user_id, {
      password,
    });
    if (updateErr) {
      console.error('[admin/reset-password] auth call failed', { status: updateErr.status, code: updateErr.code });
      const msg = /weak|password/i.test(updateErr.message ?? '')
        ? 'كلمة المرور مرفوضة — اختر كلمة أقوى'
        : 'تعذّر تعيين كلمة المرور';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // سجل تدقيق على الخادم (معرّفات فقط، لا كلمة مرور)
    console.info(
      '[audit] admin.reset_password',
      JSON.stringify({ actor: caller.id, target: user_id, targetRole: normalizeRole(targetProfile.role) }),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 });
  }
}
