import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

const ASSIGNABLE_ROLES = new Set(['owner', 'admin', 'accountant', 'cashier', 'viewer']);

/**
 * Sends a Supabase auth invite email and aligns `public.profiles`.
 * أي مستخدم مسجّل يمكنه استدعاء المسار (بدون فحص دور في الواجهة).
 * يتطلب مفتاح الخدمة على الخادم.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      full_name_ar?: string;
      role?: string;
      password?: string;
    };

    const email = String(body.email ?? '').trim();
    const full_name_ar = String(body.full_name_ar ?? '').trim();
    const role = ASSIGNABLE_ROLES.has(String(body.role)) ? String(body.role) : 'viewer';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
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

    const origin = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

    const password = body.password ? String(body.password) : undefined;

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
