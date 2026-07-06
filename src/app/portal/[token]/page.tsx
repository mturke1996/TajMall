import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { BrandGlyph } from '@/components/brand/logo';
import { formatDate, formatMoney } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

type ChargeRow = {
  id: string;
  amount: string;
  due_date: string;
  type: string;
  description: string;
  status: string;
  total_paid: string;
};

const CHARGE_TYPE_LABEL: Record<string, string> = {
  RENT: 'إيجار',
  SERVICE: 'خدمات',
  FINE: 'غرامة',
  OTHER: 'أخرى',
};

const STATUS_LABEL: Record<string, string> = {
  UNPAID: 'غير مسدَّد',
  PARTIAL: 'مسدَّد جزئياً',
  PAID: 'مسدَّد',
};

const STATUS_TONE: Record<string, string> = {
  UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
  PARTIAL: 'bg-amber-50 text-amber-800 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

/**
 * صفحة عامة (بلا تسجيل دخول) — كل البيانات تُجلب على الخادم بمفتاح
 * service_role عبر التوكن فقط. لا تُستخدم جلسة المستخدم أو RLS هنا
 * إطلاقاً، فلا خطر على بقية بيانات النظام.
 */
export default async function TenantPortalPage({ params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) return <InvalidLink />;

  const supabase = createSupabaseAdminClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, shop_number, floor, monthly_rent, phone')
    .eq('portal_token', token)
    .maybeSingle();

  if (!contact) return <InvalidLink />;

  const { data: contracts } = await supabase
    .from('lease_contracts')
    .select('id, start_date, end_date, monthly_rent, status')
    .eq('tenant_id', contact.id)
    .order('start_date', { ascending: false });

  const contractIds = (contracts ?? []).map((c) => c.id as string);

  let charges: ChargeRow[] = [];
  if (contractIds.length > 0) {
    const { data } = await supabase
      .from('tenant_charges')
      .select('id, amount, due_date, type, description, status, total_paid')
      .in('contract_id', contractIds)
      .order('due_date', { ascending: false })
      .limit(60);
    charges = (data ?? []) as ChargeRow[];
  }

  const totalOutstanding = charges.reduce((sum, c) => {
    if (c.status === 'PAID') return sum;
    return sum + (Number(c.amount) - Number(c.total_paid));
  }, 0);

  return (
    <div className="min-h-screen bg-[#FBFBFA] px-4 py-8 sm:px-6" dir="rtl">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <BrandGlyph size={44} />
          <div>
            <p className="text-[13px] font-semibold text-[#15171A]">{BRAND.fullName}</p>
            <p className="text-[11px] text-[#6b6f68]">بوابة المستأجر الذاتية</p>
          </div>
        </header>

        <div className="rounded-2xl border border-[#ECEAE3] bg-white p-5 shadow-sm">
          <p className="text-[12px] text-[#6b6f68]">مستأجر</p>
          <h1 className="mt-0.5 text-xl font-bold text-[#15171A]">{contact.name}</h1>
          {(contact.shop_number || contact.floor) && (
            <p className="mt-1 text-[13px] text-[#6b6f68]">
              {contact.shop_number ? `محل ${contact.shop_number}` : ''}
              {contact.shop_number && contact.floor ? ' · ' : ''}
              {contact.floor ? `طابق ${contact.floor}` : ''}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#ECEAE3] pt-4">
            <div>
              <p className="text-[11px] text-[#6b6f68]">الإيجار الشهري</p>
              <p className="mt-0.5 text-[15px] font-semibold text-[#15171A]">
                {formatMoney(Number(contact.monthly_rent) || 0, 'LYD')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#6b6f68]">إجمالي المستحق</p>
              <p
                className={`mt-0.5 text-[15px] font-bold ${
                  totalOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatMoney(totalOutstanding, 'LYD')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#ECEAE3] bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-[14px] font-semibold text-[#15171A]">سجل المطالبات والسداد</h2>
          {charges.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#6b6f68]">لا توجد مطالبات مسجَّلة</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#ECEAE3]">
              {charges.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#15171A]">
                      {CHARGE_TYPE_LABEL[c.type] ?? c.type} — {c.description}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6b6f68]" dir="ltr">
                      {formatDate(c.due_date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="font-mono text-[13px] font-semibold text-[#15171A]">
                      {formatMoney(Number(c.amount), '')}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[c.status] ?? ''}`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-[11px] text-[#9a9a9a]">
          هذا رابط خاص بك — لا تشاركه مع أحد. لأي استفسار تواصل مباشرة مع إدارة {BRAND.name}.
        </p>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBFBFA] px-6" dir="rtl">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-[#15171A]">الرابط غير صالح</h1>
        <p className="mt-1 text-[13px] text-[#6b6f68]">
          هذا الرابط منتهي أو غير صحيح. تواصل مع إدارة المول للحصول على رابط جديد.
        </p>
      </div>
    </div>
  );
}
