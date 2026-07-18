import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthRedirectOrigin } from '@/lib/app-url';
import { can, normalizeRole } from '@/lib/permissions';

const ASSIGNABLE_ROLES = ['owner', 'admin', 'accountant', 'cashier', 'viewer'] as const;

const inviteSchema = z.object({
  email: z.string().trim().email({ message: 'بريد إلكتروني غير صالح' }),
  full_name_ar: z.string().trim().max(200).optional().default(''),
  role: z.enum(ASSIGNABLE_ROLES).optional().default('viewer'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').optional(),
});

/**
 * Sends a Supabase auth invite email and aligns `public.profiles`.
 * يتطلب أن يكون المستدعي owner/admin (صلاحية org.users)، ويتطلب
 * مفتاح الخدمة على الخادم. لا يمكن لأي حساب آخر منح دور owner.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'بيانات غير صالحة';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { email, full_name_ar, role, password } = parsed.data;

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
    }

    // فحص الصلاحية: فقط من يملك org.users (owner/admin) يستطيع دعوة مستخدمين.
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const callerRole = normalizeRole(callerProfile?.role);
    if (!can(callerRole, 'org.users')) {
      return NextResponse.json(
        { error: 'غير مصرّح — تحتاج صلاحية إدارة المستخدمين (owner أو admin)' },
        { status: 403 },
      );
    }

    // فقط owner يستطيع منح دور owner لغيره — admin لا يستطيع صنع owner جديد.
    if (role === 'owner' && callerRole !== 'owner') {
      return NextResponse.json(
        { error: 'فقط owner يستطيع منح صلاحية owner لمستخدم آخر' },
        { status: 403 },
      );
    }

    let admin;
    try {
      admin = createSupabaseAdminClient();
    } catch {
      return NextResponse.json(
        {
          error:
            'مفتاح الخدمة (SUPABASE_SECRET_KEY) غير مضبوط — لا يمكن إرسال الدعوة من الخادم.',
        },
        { status: 503 },
      );
    }

    const origin = getAuthRedirectOrigin();

    let invitedUser;
    let invErr;

    if (password) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name_ar, full_name: full_name_ar },
      });
      invitedUser = data;
      invErr = error;
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name_ar, full_name: full_name_ar },
        redirectTo: `${origin}/login`,
      });
      invitedUser = data;
      invErr = error;
    }

    if (invErr) {
      const raw = invErr.message ?? '';
      const msg = /already|registered|exists/i.test(raw)
        ? 'هذا البريد مسجّل مسبقاً'
        : raw || 'تعذّر إرسال الدعوة';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const newId = invitedUser?.user?.id;
    if (newId) {
      await admin.from('profiles').update({ full_name_ar, role }).eq('id', newId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 });
  }
}
