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
import { cn, formatMoney, formatDate } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import {
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
  onEdit: () => void;
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
    });

  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner for Landlord */}
      <div className="rounded-2xl border border-border bg-pastel-yellow/60 p-5 dark:bg-canvas-sunken">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              <Building className="h-6 w-6 stroke-[1.8]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{contact.name}</h2>
                <Badge variant="outline" className="border-amber-400 bg-amber-100/60 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
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
                className="gap-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs h-9 shadow-xs"
              >
                <Plus className="h-4 w-4" />
                تسجيل سداد إيجار للمؤجر
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onEdit} className="text-xs h-9">
              تعديل بيانات العقد
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Landlord KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">الإيجار الشهري المستحق</span>
          <p className="text-xl font-bold text-amber-900 dark:text-amber-200 font-mono">
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
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono">
            {formatMoney(schedule.totalPaid, 'LYD')}
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block mt-1">
            سُدّد {schedule.paidMonthsCount} شهراً بالكامل
          </span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">المتبقي / المتأخرات ({selectedYear})</span>
          <p className={cn(
            'text-xl font-bold font-mono',
            schedule.totalOutstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'
          )}>
            {formatMoney(schedule.totalOutstanding, 'LYD')}
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">
            {schedule.unpaidMonthsCount} أشهر غير مدفوعة
          </span>
        </Card>
      </div>

      {/* 3. Landlord Month-by-Month Rent Schedule (مثل كشف إيجارات المستأجرين) */}
      <Card className="border-border shadow-xs overflow-hidden">
        <CardHeader className="bg-canvas-sunken/40 border-b border-border py-3.5 px-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-700" />
            <CardTitle className="text-sm font-bold">
              جدول استحقاقات وسداد إيجار المؤجر لعام {selectedYear}
            </CardTitle>
          </div>

          <div className="flex items-center gap-1.5 bg-card p-0.5 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="px-2 font-mono font-bold text-xs">{selectedYear}</span>
            <button
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
            <table className="w-full text-xs text-right" dir="rtl">
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
                        m.status === 'paid_full' && 'bg-emerald-50/20 dark:bg-emerald-950/10',
                        m.status === 'unpaid' && m.expectedAmount > 0 && 'bg-red-50/10 dark:bg-red-950/10'
                      )}
                    >
                      <td className="py-3 px-4 font-bold text-foreground">
                        {m.monthNameAr} ({m.monthNum})
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-foreground">
                        {formatMoney(m.expectedAmount, '')}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatMoney(m.paidAmount, '')}
                      </td>
                      <td className={cn(
                        'py-3 px-4 font-mono font-semibold',
                        m.remainingAmount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                      )}>
                        {formatMoney(m.remainingAmount, '')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {m.status === 'paid_full' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 gap-1 text-[10px]">
                            <CheckCircle2 className="h-3 w-3" />
                            مدفوع بالكامل
                          </Badge>
                        ) : m.status === 'paid_partial' ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 gap-1 text-[10px]">
                            <Clock className="h-3 w-3" />
                            مسدد جزئياً
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950 dark:text-red-300 text-[10px]">
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
                            className="h-7 text-[11px] font-semibold text-amber-800 border-amber-300 hover:bg-amber-50 dark:text-amber-200 dark:border-amber-800"
                          >
                            سداد شهر {m.monthNameAr}
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-medium">مكتمل</span>
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
                  <td className="py-3 px-4 font-mono text-emerald-700 dark:text-emerald-300">{formatMoney(schedule.totalPaid, '')}</td>
                  <td className="py-3 px-4 font-mono text-red-600 dark:text-red-400">{formatMoney(schedule.totalOutstanding, '')}</td>
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
            <MapPin className="h-4 w-4 text-amber-700" />
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
            <ShieldCheck className="h-4 w-4 text-amber-700" />
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
              <span className="font-medium text-foreground">{contact.notes || 'لا توجد ملاحظات'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">حالة العقد:</span>
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ساري المفعول
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. Complete Financial Ledger & Journal Entries */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-amber-700" />
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


