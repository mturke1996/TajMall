'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CalendarCheck, Phone, Plus, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Callout,
  DonutBreakdown,
  InfoList,
  KpiStrip,
  MiniBars,
  MonthField,
  MonthGrid,
  MonthlyBarChart,
  PartyAvatar,
  ProfileHeader,
  RoleBadge,
  SectionCard,
} from '@/components/people';
import { CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { landlordSuggestionText, suggestLandlord, LANDLORD_SUGGESTION_ACTION } from '@/lib/contacts/contact-tags';
import { buildObligationLast12, buildObligationYear, type ObligationPayment } from '@/lib/people/obligation-months';
import { buildPartyStats, groupAccounts, sideOf } from '@/lib/people/party-stats';
import { monthNameAr } from '@/lib/rent-months';
import { arabicCount, formatMoney } from '@/lib/utils';

const TODAY = '2026-10-19';
const GO_LIVE = '2026-06';

let seq = 0;
const pay = (amount: number, date: string, description: string | null = null): ObligationPayment => ({
  id: `p${++seq}`,
  tx_date: date,
  amount: String(amount),
  status: 'POSTED',
  kind: 'EXPENSE',
  description,
});
const tx = (kind: 'REVENUE' | 'EXPENSE', amount: number, date: string, code: string, name: string) => ({
  id: `t${++seq}`,
  kind,
  status: 'POSTED',
  amount: String(amount),
  tx_date: date,
  category: { id: code, code, name_ar: name },
});

const LANDLORD_PAYMENTS = [pay(25000, '2026-07-30'), pay(27000, '2026-07-31'), pay(27000, '2026-08-31'), pay(25000, '2026-08-31')];
const CONTACT = { id: 'x', notes: '[role:landlord]', monthly_rent: null, contract_start: null, contract_end: null };

const VENDOR_TX = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m, i) => tx('EXPENSE', 2400 + i * 310, `2026-${String(Math.min(m, 10)).padStart(2, '0')}-08`, 'EXP-ELC', 'كهرباء')),
  tx('EXPENSE', 1850, '2026-09-20', 'EXP-MNT', 'صيانة'),
  tx('EXPENSE', 920, '2026-10-02', 'EXP-MAT', 'مواد تشغيل'),
  tx('EXPENSE', 640, '2026-08-17', 'EXP-WTR', 'مياه'),
  tx('EXPENSE', 430, '2026-07-12', 'EXP-TEL', 'اتصالات'),
  tx('EXPENSE', 380, '2026-06-30', 'EXP-SEC', 'حراسة'),
  tx('EXPENSE', 150, '2026-05-30', 'EXP-OTH', 'متفرقات'),
];

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {note && <p className="text-[12.5px] text-ink-mute">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const ROLES = Object.keys(CONTACT_ROLES) as ContactBusinessRole[];

export function PeoplePreview() {
  const [picked, setPicked] = useState<string | null>(null);
  const [since, setSince] = useState('2026-07');
  const suggestion = useMemo(
    () => suggestLandlord(LANDLORD_PAYMENTS.map((p) => ({ ...p, category: { code: 'EXP-RNT' } })), { kind: 'CUSTOMER', notes: '' }),
    [],
  );

  const year = useMemo(() => buildObligationYear({ contact: CONTACT, payments: LANDLORD_PAYMENTS, today: TODAY, year: 2026, goLiveMonth: GO_LIVE }), []);
  const last12 = useMemo(
    () => buildObligationLast12({ contact: { ...CONTACT, monthly_rent: '1000', notes: '[role:landlord]\n[since:2026-02]' }, payments: [], today: '2027-02-10' }),
    [],
  );
  const stats = useMemo(() => buildPartyStats(VENDOR_TX, { asOf: TODAY }), []);
  const out = sideOf(stats, 'out');
  const chart = out.series.map((p) => ({ label: monthNameAr(p.monthKey), 'مدفوع': p.amount }));
  const twoSeries = out.series.map((p, i) => ({ label: monthNameAr(p.monthKey), 'إيرادات': Math.round(p.amount * 1.4) + (i % 3) * 200, 'مصروفات': p.amount }));
  const slices = groupAccounts(out.accounts, { top: 4 }).map((a) => ({ key: a.key, label: a.name, value: a.total, rest: a.rest }));

  return (
    <div className="min-h-dvh bg-background" dir="rtl">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-8">
        <header className="space-y-1">
          <p className="text-[12px] text-muted-foreground">بيئة التطوير فقط، بيانات وهمية</p>
          <h1 className="text-2xl font-semibold">مكونات صفحات الأشخاص</h1>
        </header>

        <Block title="رأس الملف" note="مورد مؤجر، عميل مؤرشف، وملف بلا بيانات اتصال">
          <div className="space-y-4">
            <ProfileHeader
              name="شركة الأفق للاستثمار العقاري"
              code="V-0004"
              role="LANDLORD"
              subtitle="مؤجر موقع المولدات والمواقف"
              status={{ label: 'نشط', tone: 'success' }}
              roles={['LANDLORD']}
              contact={{ phone: '0912345678', phone2: '0925550123', email: 'afaq@example.test', address: 'طرابلس، شارع الجمهورية' }}
              back={{ href: '/ui-kit/people', label: 'الموردون' }}
              actions={
                <>
                  <Button>
                    <Plus />
                    سجّل دفعة
                  </Button>
                  <Button variant="outline">
                    <Phone />
                    اتصال
                  </Button>
                </>
              }
              stickyAction={<Button size="sm">سجّل دفعة</Button>}
            />
            <ProfileHeader
              name="محمد المبروك الطاهر"
              code="C-0021"
              role="CUSTOMER"
              inactive
              status={{ label: 'مؤرشف', tone: 'neutral' }}
              roles={['CUSTOMER']}
              contact={{ phone: '0913334455' }}
              back={{ href: '/ui-kit/people', label: 'العملاء' }}
            />
            <ProfileHeader name="مصنع الصفا" role="SUPPLIER_GOODS" roles={['SUPPLIER_GOODS', 'SERVICE_PROVIDER']} subtitle="توريد مواد نظافة" />
          </div>
        </Block>

        <Block title="الرمز الحرفي والأدوار" note="لون الدور يظهر في الرمز وفي الشارة">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {ROLES.map((r) => (
              <span key={r} className="inline-flex items-center gap-2.5">
                <PartyAvatar name={CONTACT_ROLES[r].badge} role={r} size="md" />
                <RoleBadge role={r} />
              </span>
            ))}
            <PartyAvatar name="" size="md" />
            <PartyAvatar name="الشركة العامة للكهرباء" role="SUPPLIER_ELECTRICITY" size="sm" />
          </div>
        </Block>

        <Block title="بطاقات الأرقام" note="جاهزة، قيد التحميل، وخطأ في التحميل">
          <div className="space-y-4">
            <KpiStrip
              label="أرقام المورد"
              items={[
                { label: 'المدفوع له 2026', icon: ArrowUpFromLine, accent: 'red', value: out.total, context: `${arabicCount(out.count, ['دفعة واحدة', 'دفعتان', 'دفعات', 'دفعة'])}` },
                { label: 'آخر دفعة', icon: CalendarCheck, accent: 'blue', value: out.last?.amount ?? null, context: out.last?.date },
                { label: 'المعدل الشهري', icon: Wallet, accent: 'amber', value: out.averagePerActiveMonth, context: `في ${arabicCount(out.activeMonths, ['شهر فيه حركة', 'شهرين فيهما حركة', 'أشهر فيها حركة', 'شهراً فيها حركة'])}` },
                { label: 'المستحق عليه', icon: Receipt, accent: 'violet', value: 104000, context: 'شهران، المبلغ تقديري', contextTone: 'warn', tone: 'warn' },
              ]}
            />
            <KpiStrip
              label="حالات التحميل والخطأ"
              items={[
                { label: 'المدفوع', icon: ArrowUpFromLine, accent: 'red', state: 'loading' },
                { label: 'المقبوض', icon: ArrowDownToLine, accent: 'green', state: 'error', onRetry: () => undefined },
                { label: 'صافي', icon: Wallet, accent: 'teal', value: -1250.5, context: 'خرج أكثر مما دخل', contextTone: 'bad', tone: 'bad' },
              ]}
            />
          </div>
        </Block>

        <Block title="أشهر الإيجار" note="مؤجر دفع له في يوليو وأغسطس، المنظومة بدأت في يونيو، بلا إيجار شهري مسجّل">
          <SectionCard title="إيجار 2026" description="الحالة شهراً بشهر" icon={CalendarCheck} accent="violet">
            <MonthGrid
              months={year.months}
              columns={6}
              footnote="المتابعة من يوليو 2026، من أول دفعة مسجّلة. المبالغ التقديرية مأخوذة من آخر شهر مسجّل."
              onSelect={(m) => setPicked(`${m.monthNameAr} ${m.year}`)}
              renderAction={(m) =>
                m.status === 'due' ? (
                  <Button size="sm" variant="outline" className="min-h-11 w-full sm:min-h-9">
                    سدّد
                  </Button>
                ) : null
              }
            />
            {picked && <p className="mt-3 text-[12.5px] text-ink-mute">اخترت: {picked}</p>}
          </SectionCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="آخر 12 شهراً" description="عبر نهاية السنة، 4 أعمدة" icon={CalendarCheck} accent="violet">
              <MonthGrid months={last12.months} columns={4} legend />
            </SectionCard>
            <SectionCard title="ثلاثة أعمدة" description="قيد التحميل ثم خطأ" icon={CalendarCheck} accent="violet">
              <div className="space-y-4">
                <MonthGrid months={[]} loading columns={3} />
                <MonthGrid months={[]} error onRetry={() => undefined} />
              </div>
            </SectionCard>
          </div>
        </Block>

        <Block title="الرسوم" note="شريط مصغّر، أعمدة شهرية، حلقة التوزيع">
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="المدفوع شهرياً" description="آخر 12 شهراً" icon={ArrowUpFromLine} accent="red" className="lg:col-span-2">
              <MiniBars className="mb-4 max-w-xs" accent="red" title="المدفوع آخر 12 شهراً" points={out.series.map((p) => ({ label: p.monthKey, value: p.amount }))} />
              <MonthlyBarChart
                title="المدفوع شهرياً"
                data={chart}
                series={[{ key: 'مدفوع', label: 'مدفوع', accent: 'red' }]}
                summary={<p className="mt-3 text-[13px] text-ink-mute">الإجمالي {formatMoney(out.total, 'LYD')}</p>}
              />
            </SectionCard>
            <SectionCard title="التوزيع حسب البند" description="حصة كل بند" icon={Receipt} accent="red">
              <DonutBreakdown slices={slices} centerLabel="المدفوع" />
            </SectionCard>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="إيرادات ومصروفات" description="سلسلتان" icon={Wallet} accent="teal" className="lg:col-span-2">
              <MonthlyBarChart
                title="إيرادات ومصروفات"
                data={twoSeries}
                series={[
                  { key: 'إيرادات', label: 'إيرادات', accent: 'green' },
                  { key: 'مصروفات', label: 'مصروفات', accent: 'red' },
                ]}
              />
            </SectionCard>
            <div className="space-y-4">
              <SectionCard title="فارغ" icon={Wallet} accent="blue">
                <MonthlyBarChart title="فارغ" data={chart.map((r) => ({ ...r, مدفوع: 0 }))} series={[{ key: 'مدفوع', label: 'مدفوع', accent: 'red' }]} />
              </SectionCard>
              <SectionCard title="خطأ" icon={Wallet} accent="blue">
                <MonthlyBarChart title="خطأ" data={[]} series={[]} error onRetry={() => undefined} />
              </SectionCard>
              <SectionCard title="تحميل" icon={Wallet} accent="blue">
                <DonutBreakdown slices={[]} centerLabel="المدفوع" loading />
              </SectionCard>
            </div>
          </div>
        </Block>

        <Block title="تنبيهات وحقل الشهر" note="ملاحظة بإجراء واحد، وبداية المتابعة">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Callout tone="info" title="اعتماد كمؤجر" action={<Button variant="outline">{LANDLORD_SUGGESTION_ACTION}</Button>}>
                {landlordSuggestionText(suggestion)}
              </Callout>
              <Callout tone="warning" title="بداية المتابعة غير محدّدة">
                تُحسب الأشهر من أول دفعة مسجّلة. حدّد الشهر إن كانت المتابعة تبدأ قبلها.
              </Callout>
              <Callout tone="danger" title="تعذّر تحميل الدفعات" action={<Button variant="outline">إعادة المحاولة</Button>} />
            </div>
            <SectionCard title="بداية المتابعة" description="الأشهر السابقة لها تُعدّ مسدّدة قبل المنظومة" icon={CalendarCheck} accent="violet">
              <MonthField label="أول شهر تتابعه المنظومة" value={since} onChange={setSince} hint={since ? `القيمة المحفوظة: ${since}` : 'لا شهر محدّد: تُؤخذ من أول دفعة.'} />
            </SectionCard>
          </div>
        </Block>

        <Block title="بيانات الملف">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="بيانات التعريف" icon={Receipt} accent="blue">
              <InfoList
                items={[
                  { label: 'الاسم بالإنجليزية', value: 'Al Ofoq Real Estate', ltr: true },
                  { label: 'الهاتف', value: '0912345678', ltr: true, href: 'tel:0912345678' },
                  { label: 'البريد', value: null },
                  { label: 'الرقم الضريبي', value: '' },
                  { label: 'العنوان', value: 'طرابلس، شارع الجمهورية، بجوار المصرف' },
                  { label: 'الإيجار الشهري', value: formatMoney(52000, 'LYD') },
                ]}
              />
            </SectionCard>
            <SectionCard title="لوحة بلا بيانات" description="الحالات الأربع" icon={Receipt} accent="amber" status="empty" emptyText="لا توجد دفعات مسجّلة بعد." emptyAction={<Button variant="outline" className="min-h-11 sm:min-h-9">سجّل دفعة</Button>}>
              <span />
            </SectionCard>
            <SectionCard title="خطأ في التحميل" icon={Receipt} accent="red" status="error" onRetry={() => undefined}>
              <span />
            </SectionCard>
            <SectionCard title="قيد التحميل" icon={Receipt} accent="blue" status="loading" skeletonRows={4}>
              <span />
            </SectionCard>
          </div>
        </Block>
      </main>
    </div>
  );
}
