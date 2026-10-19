import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthRedirectOrigin } from '@/lib/app-url';
import { can, normalizeRole } from '@/lib/permissions';
import { isJsonRequest, isSameOriginRequest } from '@/lib/supabase/request-guard';

const ASSIGNABLE_ROLES = ['owner', 'admin', 'accountant', 'cashier', 'viewer'] as const;

const inviteSchema = z.object({
  email: z.string().trim().max(254, 'بريد إلكتروني غير صالح').pipe(z.email('بريد إلكتروني غير صالح')),
  full_name_ar: z.string().trim().max(200).optional().default(''),
  role: z.enum(ASSIGNABLE_ROLES, 'دور غير صالح').optional().default('viewer'),
  // 72 is the most the auth service hashes (bcrypt): a longer one is cut off silently or refused
  password: z
    .string('كلمة المرور غير صالحة')
    .min(10, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل')
    .max(72, 'كلمة المرور يجب ألا تزيد على 72 حرفاً')
    .optional(),
});

/**
 * Sends a Supabase auth invite email and aligns `public.profiles`.
 * يتطلب أن يكون المستدعي owner/admin (صلاحية org.users)، ويتطلب
 * مفتاح الخدمة على الخادم. لا يمكن لأي حساب آخر منح دور owner.
 *
 * الترتيب مقصود: الأصل (أهو طلب من موقعنا؟) ثم الهوية ثم الصلاحية، وبعدها فقط قراءة الجسم.
 * الدور يُقرأ من قاعدة البيانات بجلسة المستدعي نفسه، لا من أي ادّعاء في الطلب.
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

    const rawBody = await req.json().catch(() => ({}));
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'بيانات غير صالحة';
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { email, full_name_ar, role, password } = parsed.data;

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
        // the invitee sets a first password there (the link carries #type=invite)
        redirectTo: `${origin}/login/reset-password`,
      });
      invitedUser = data;
      invErr = error;
    }

    if (invErr) {
      const raw = invErr.message ?? '';
      // the upstream text is for the server log; the screen gets a message we wrote
      console.error('[admin/invite] auth call failed', { status: invErr.status, code: invErr.code });
      const msg = /already|registered|exists/i.test(raw)
        ? 'هذا البريد مسجّل مسبقاً'
        : /weak|password/i.test(raw)
          ? 'كلمة المرور مرفوضة — اختر كلمة أقوى'
          : 'تعذّر إرسال الدعوة';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const newId = invitedUser?.user?.id;
    if (newId) {
      const { error: profileErr } = await admin
        .from('profiles')
        .update({ full_name_ar, role })
        .eq('id', newId);
      if (profileErr) {
        // لا نترك مستخدماً بصلاحيات افتراضية خاطئة بعد إنشاء Auth
        try {
          await admin.auth.admin.deleteUser(newId);
        } catch (rollbackErr) {
          console.error('invite profile update failed; auth rollback failed', {
            profileErr,
            rollbackErr,
          });
        }
        return NextResponse.json(
          {
            error:
              'تعذّر تعيين الدور والاسم بعد إنشاء الحساب — أُلغي الحساب. أعد المحاولة.',
          },
          { status: 500 },
        );
      }
    }

    // سجل تدقيق على الخادم (معرّفات فقط، لا بريد ولا كلمة مرور)
    const creation = password ? 'direct' : 'email-invite';
    console.info(
      '[audit] admin.invite',
      JSON.stringify({ actor: user.id, actorRole: callerRole, target: newId ?? null, role, creation }),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 });
  }
}
