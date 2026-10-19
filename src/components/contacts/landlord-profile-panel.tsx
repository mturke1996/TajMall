'use client';

import React, { useState } from 'react';
import {
  Building,
  Calendar,
  DollarSign,
  Receipt,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  MapPin,
  FileText,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { arabicCount, cn, formatMoney, formatDate, todayISODate } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { visibleContactNotes,
  buildLandlordRentSchedule,
  type LandlordRentSchedule,
  type LandlordRentMonth,
} from '@/lib/contacts/contact-roles';
import { useTxDialog } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import { ContactLedgerPanel } from '@/components/contacts/contact-ledger-panel';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';


type Props = {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading: boolean;
  onEdit?: () => void;
};

export function LandlordProfilePanel({
  contact,
  transactions,
  journalEntries,
  txLoading,
  onEdit,
}: Props) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const openTx = useTxDialog((s) => s.open);
  const { can } = usePermission();
  const mayRecordPayment = canCreateContactTransaction(contact.is_active, can('expense.create'));

  const schedule: LandlordRentSchedule = React.useMemo(() => {
    return buildLandlordRentSchedule(contact, transactions, selectedYear);
  }, [contact, transactions, selectedYear]);

  const handleRecordLandlordPayment = (targetMonth?: LandlordRentMonth) => {
    if (!mayRecordPayment) return;
    const desc = targetMonth
      ? `سداد إيجار شهر ${targetMonth.monthNameAr} ${selectedYear} للمؤجر ${contact.name}`
      : `سداد إيجار للمؤجر ${contact.name}`;

    openTx({
      kind: 'EXPENSE',
      contactId: contact.id,
      contactKind: contact.kind,
      // the month in the description is what the schedule attributes the payment to
      description: desc,
      amount: targetMonth?.remainingAmount,
    });

  };

  // contract dates are calendar days; an ended or not-yet-started lease must not read as in force
  const today = todayISODate();
  const contractStart = contact.contract_start?.slice(0, 10) ?? '';
  const contractEnd = contact.contract_end?.slice(0, 10) ?? '';
  const contractState =
    !contractStart && !contractEnd
      ? 'unset'
      : contractEnd && contractEnd < today
        ? 'ended'
        : contractStart && contractStart > today
          ? 'upcoming'
          : 'active';

  return (
    <div className="space-y-6">
      {/* 1. Header Banner for Landlord */}
      <div className="rounded-2xl border border-border bg-pastel-yellow/60 p-5 dark:bg-canvas-sunken">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-canvas-sunken text-muted-foreground">
              <Building className="h-6 w-6 stroke-[1.8]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{contact.name}</h2>
                <Badge variant="outline" className="border-warning bg-warning-soft/60 text-warning-ink">
                  مؤجر للمول (المول مستأجر منه)
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {contact.shop_number ? `الموقع/العقار: ${contact.shop_number}` : 'عقار مؤجر للمول'}
                {contact.area_sqm ? ` · المساحة: ${contact.area_sqm} م²` : ''}
                {contact.phone ? ` · الهاتف: ${contact.phone}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mayRecordPayment && (
              <Button
                onClick={() => handleRecordLandlordPayment()}
                className="gap-1.5 font-semibold text-xs h-9"
              >
                <Plus className="h-4 w-4" />
                تسجيل سداد إيجار للمؤجر
              </Button>
            )}
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit} className="text-xs h-9">
                تعديل بيانات العقد
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Landlord KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">الإيجار الشهري المستحق</span>
          <p className="text-xl font-bold text-warning-ink font-mono">
            {formatMoney(schedule.monthlyRent, 'LYD')}
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">حسب عقد الإيجار</span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">إجمالي المستحق ({selectedYear})</span>
          <p className="text-xl font-bold text-foreground font-mono">
            {formatMoney(schedule.totalExpected, 'LYD')}
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">12 شهراً × القيمة</span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">المدفوع للمؤجر ({selectedYear})</span>
          <p className="text-xl font-bold text-success-ink font-mono">
            {formatMoney(schedule.totalPaid, 'LYD')}
          </p>
          <span className="text-[11px] text-success-ink block mt-1">
            سُدّد بالكامل: {arabicCount(schedule.paidMonthsCount, ['شهر واحد', 'شهران', 'أشهر', 'شهراً'])}
          </span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">المتبقي / المتأخرات ({selectedYear})</span>
          <p className={cn(
            'text-xl font-bold font-mono',
            schedule.totalOutstanding > 0 ? 'text-danger' : 'text-success'
          )}>
            {formatMoney(schedule.totalOutstanding, 'LYD')}
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">
            غير مدفوع: {arabicCount(schedule.unpaidMonthsCount, ['شهر واحد', 'شهران', 'أشهر', 'شهراً'])}
          </span>
        </Card>
      </div>

      {/* 3. Landlord Month-by-Month Rent Schedule (مثل كشف إيجارات المستأجرين) */}
      <Card className="border-border overflow-hidden">
        <CardHeader className="bg-canvas-sunken/40 border-b border-border py-3.5 px-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-warning-ink" />
            <CardTitle className="text-sm font-bold">
              جدول استحقاقات وسداد إيجار المؤجر لعام {selectedYear}
            </CardTitle>
          </div>

          <div className="flex items-center gap-1.5 bg-card p-0.5 rounded-lg border border-border">
            <button aria-label="السنة السابقة"
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="px-2 font-mono font-bold text-xs">{selectedYear}</span>
            <button aria-label="السنة التالية"
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start" dir="rtl">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground font-semibold border-b border-border">
                  <th className="py-3 px-4">الشهر المستهدف</th>
                  <th className="py-3 px-4">قيمة الإيجار المستحق</th>
                  <th className="py-3 px-4">المبلغ المسدد للمؤجر</th>
                  <th className="py-3 px-4">المتبقي</th>
                  <th className="py-3 px-4 text-center">حالة السداد</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedule.months.map((m) => {
                  return (
                    <tr
                      key={m.monthKey}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        m.status === 'paid_full' && 'bg-success-soft/20',
                        m.status === 'unpaid' && m.expectedAmount > 0 && 'bg-danger-soft/10'
                      )}
                    >
                      <td className="py-3 px-4 font-bold text-foreground">
                        {m.monthNameAr} ({m.monthNum})
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">
                        {formatMoney(m.expectedAmount, '')}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-success-ink">
                        {formatMoney(m.paidAmount, '')}
                      </td>
                      <td className={cn(
                        'py-3 px-4 font-mono font-semibold',
                        m.remainingAmount > 0 ? 'text-danger' : 'text-muted-foreground'
                      )}>
                        {formatMoney(m.remainingAmount, '')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.status === 'paid_full' ? (
                          <Badge className="bg-success-soft text-success-ink hover:bg-success-soft gap-1 text-[11px]">
                            <CheckCircle2 className="h-3 w-3" />
                            مدفوع بالكامل
                          </Badge>
                        ) : m.status === 'paid_partial' ? (
                          <Badge className="bg-warning-soft text-warning-ink hover:bg-warning-soft gap-1 text-[11px]">
                            <Clock className="h-3 w-3" />
                            مسدد جزئياً
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-danger-ink border-danger-line bg-danger-soft/50 text-[11px]">
                            غير مدفوع
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.remainingAmount > 0 && mayRecordPayment ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRecordLandlordPayment(m)}
                            className="h-7 text-[11px] font-semibold text-warning-ink border-warning-line hover:bg-warning-soft"
                          >
                            سداد شهر {m.monthNameAr}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-medium">
                            {m.remainingAmount > 0 ? '—' : 'مكتمل'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-canvas-sunken font-bold border-t-2 border-border text-foreground">
                  <td className="py-3 px-4">الإجمالي السنوي</td>
                  <td className="py-3 px-4 font-mono">{formatMoney(schedule.totalExpected, '')}</td>
                  <td className="py-3 px-4 font-mono text-success-ink">{formatMoney(schedule.totalPaid, '')}</td>
                  <td className="py-3 px-4 font-mono text-danger">{formatMoney(schedule.totalOutstanding, '')}</td>
                  <td colSpan={2} className="py-3 px-4 text-center text-xs text-muted-foreground">
                    تم سداد {schedule.paidMonthsCount} من أصل 12 شهراً
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 4. Leased Location & Contract Terms Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-warning-ink" />
            <h3 className="text-xs font-bold text-foreground">بيانات الموقع والعقار المستأجر</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">اسم العقار / الموقع:</span>
              <span className="font-semibold text-foreground">{contact.shop_number || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">الموقع / الطابق:</span>
              <span className="font-semibold text-foreground">{contact.floor || 'المول / خارجي'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">المساحة المستأجرة:</span>
              <span className="font-semibold text-foreground">{contact.area_sqm ? `${contact.area_sqm} م²` : 'غير محدد'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">العنوان:</span>
              <span className="font-semibold text-foreground">{contact.address || '—'}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-warning-ink" />
            <h3 className="text-xs font-bold text-foreground">شروط العقد والتواريخ</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">تاريخ بداية العقد:</span>
              <span className="font-semibold text-foreground font-mono">
                {contact.contract_start ? formatDate(contact.contract_start) : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">تاريخ نهاية العقد:</span>
              <span className="font-semibold text-foreground font-mono">
                {contact.contract_end ? formatDate(contact.contract_end) : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">ملاحظات العقد:</span>
              <span className="font-medium text-foreground">{visibleContactNotes(contact.notes) || 'لا توجد ملاحظات'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">حالة العقد:</span>
              {contractState === 'unset' ? (
                <Badge variant="outline">غير محدد</Badge>
              ) : contractState === 'ended' ? (
                <Badge className="bg-danger-soft text-danger-ink">منتهٍ</Badge>
              ) : contractState === 'upcoming' ? (
                <Badge className="bg-warning-soft text-warning-ink">لم يبدأ</Badge>
              ) : (
                <Badge className="bg-success-soft text-success-ink">ساري المفعول</Badge>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* 5. Complete Financial Ledger & Journal Entries */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-warning-ink" />
          كشف الحساب المالي وسجل القيود والدفعات للمؤجر
        </h3>
        <ContactLedgerPanel
          contact={contact}
          transactions={transactions}
          journalEntries={journalEntries}
          txLoading={txLoading}
        />
      </div>
    </div>
  );
}


