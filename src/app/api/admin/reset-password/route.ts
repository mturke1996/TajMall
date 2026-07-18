import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { can, normalizeRole } from '@/lib/permissions';

const schema = z.object({
  user_id: z.string().uuid('معرّف مستخدم غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
});

/**
 * يعيّن كلمة مرور جديدة لمستخدم دون الحاجة للكلمة القديمة.
 * للمدير/المالك فقط (org.users) — يستخدم مفتاح الخدمة.
 */
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'بيانات غير صالحة';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { user_id, password } = parsed.data;

    const supabase = createSupabaseServerClient();
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
    if (!can(callerRole, 'org.users')) {
      return NextResponse.json(
        { error: 'غير مصرّح — تحتاج صلاحية إدارة المستخدمين' },
        { status: 403 },
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

    const targetRole = normalizeRole(targetProfile.role);
    if (targetRole === 'owner' && callerRole !== 'owner') {
      return NextResponse.json({ error: 'فقط owner يستطيع تغيير كلمة مرور owner' }, { status: 403 });
    }

    if (user_id === caller.id) {
      return NextResponse.json(
        { error: 'لحسابك استخدم «نسيت كلمة المرور» من صفحة الدخول' },
        { status: 400 },
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(user_id, {
      password,
    });
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 });
  }
}
