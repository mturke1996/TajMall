'use client';

import { useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/data/empty-state';
import { DataToolbar, isInDatePreset, type DateRangePreset } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { filterTransactions } from '@/lib/transactions-filter';
import type { TransactionWithRelations } from '@/lib/db/types';

const DESCRIPTIONS = [
  'تحصيل إيجار شهر سبتمبر',
  'صيانة مكيفات الطابق الأول',
  'إيراد مواقف السيارات',
  'فاتورة كهرباء الممرات',
  'تحصيل إيجار شهرين مقدماً',
  'مواد نظافة',
  'رسوم فعالية نهاية الأسبوع',
  'مرتبات الحراسة',
];
const PARTIES = ['محل الأمل للملابس', 'مقهى الواحة', 'شركة الخدمات المتحدة', 'محل النور للعطور', null];
const CASHBOXES = ['الخزينة النقدية', 'مصرف الواحة', 'مصرف شمال أفريقيا'];
const METHODS = ['CASH', 'TRANSFER', 'CHEQUE', 'CARD'] as const;

/** Deterministic fictional rows so screenshots are comparable between runs. */
function sampleTransactions(count: number): TransactionWithRelations[] {
  return Array.from({ length: count }, (_, i) => {
    const revenue = i % 3 !== 1;
    const day = String(1 + ((i * 7) % 28)).padStart(2, '0');
    const month = String(1 + ((i * 5) % 9)).padStart(2, '0');
    const party = PARTIES[i % PARTIES.length];
    return {
      id: `sample-${i}`,
      number: 1000 + i,
      reference: null,
      kind: revenue ? 'REVENUE' : 'EXPENSE',
      status: 'POSTED',
      method: METHODS[i % METHODS.length],
      amount: String(revenue ? 1500 + ((i * 937) % 9000) : 120 + ((i * 431) % 4000)),
      currency: 'LYD',
      tx_date: `2026-${month}-${day}`,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
      created_at: `2026-${month}-${day}T10:00:00Z`,
      category: { id: `cat-${i % 4}`, code: revenue ? 'REV-RNT' : 'EXP-MNT', name_ar: revenue ? 'إيجارات المحلات' : 'م.صيانة', kind: revenue ? 'REVENUE' : 'EXPENSE', color: null },
      cashbox: { id: `cb-${i % 3}`, code: `CB${i % 3}`, name_ar: CASHBOXES[i % CASHBOXES.length], kind: 'CASH', bank_name: null },
      contact: party ? { id: `c-${i % 4}`, name: party, kind: revenue ? 'TENANT' : 'VENDOR', shop_number: revenue ? String(100 + (i % 40)) : null } : null,
      creator: { id: 'u1', full_name_ar: i % 2 ? 'أمين الخزينة' : 'المحاسب', full_name: null },
    } as unknown as TransactionWithRelations;
  });
}

export function UiKit() {
  const rows = useMemo(() => sampleTransactions(87), []);
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<DateRangePreset>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const filtered = useMemo(
    () => filterTransactions(rows.filter((r) => isInDatePreset(r.tx_date, preset)), query),
    [rows, preset, query],
  );

  return (
    <div className="flex min-h-dvh bg-background" dir="rtl">
      <Sidebar previewAllItems />
      <main className="min-w-0 flex-1 space-y-10 px-4 py-8 sm:px-8">
        <header className="space-y-1">
          <p className="text-[12px] text-muted-foreground">بيئة التطوير فقط — بيانات وهمية</p>
          <h1 className="text-2xl font-semibold">معرض مكونات Fluxen</h1>
        </header>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">الأزرار والشارات</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button>حفظ المعاملة</Button>
            <Button variant="outline">تصدير</Button>
            <Button variant="secondary">تصفية</Button>
            <Button variant="ghost">إلغاء</Button>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              حذف معاملة (حوار التأكيد)
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">مسدد</Badge>
            <Badge variant="warning">جزئي</Badge>
            <Badge variant="danger">متأخر</Badge>
            <Badge variant="info">حوالة</Badge>
            <Badge variant="plum">بطاقة</Badge>
            <Badge variant="neutral">مسودة</Badge>
            <Badge variant="outline">معفى</Badge>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">جدول المعاملات</h2>
          <DataToolbar
            searchPlaceholder="ابحث برقم المعاملة أو البيان أو الجهة أو المبلغ…"
            count={filtered.length}
            onSearch={setQuery}
            datePreset={preset}
            onDatePreset={setPreset}
          />
          <TransactionsTable rows={filtered} isFiltered={Boolean(query) || preset !== 'all'} tableId="ui-kit" />
        </section>

        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">الحالات</h2>
          <TransactionsTable rows={[]} loading tableId="ui-kit-loading" />
          <EmptyState icon={Receipt} title="لا توجد معاملات بعد" description="ابدأ بإضافة أول معاملة" action={{ label: 'إضافة معاملة', onClick: () => {} }} />
        </section>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="حذف المعاملة"
        description="سيُعكس قيدها المحاسبي ويعود رصيد الخزينة كما كان."
        details={[
          { label: 'رقم', value: <span dir="ltr">#1042</span> },
          { label: 'البيان', value: 'تحصيل إيجار شهر سبتمبر' },
          { label: 'المبلغ', value: <span dir="ltr" className="font-mono">4,250.000 LYD</span> },
        ]}
        confirmLabel="احذف المعاملة"
        onConfirm={async () => {
          await new Promise((r) => setTimeout(r, 400));
        }}
      />
    </div>
  );
}
