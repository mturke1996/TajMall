'use client';

import React from 'react';
import {
  Zap,
  Droplets,
  Package,
  Wrench,
  Calendar,
  DollarSign,
  Plus,
  Receipt,
  FileText,
  Clock,
  TrendingDown,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import {
  CONTACT_ROLES,
  type ContactBusinessRole,
} from '@/lib/contacts/contact-roles';
import { useTxDialog } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import { ContactLedgerPanel } from '@/components/contacts/contact-ledger-panel';
import { canCreateContactTransaction } from '@/lib/contacts/form-utils';
import { getPostedContactTransactions } from '@/lib/contacts/contact-transactions';


type Props = {
  contact: ContactRow;
  role: ContactBusinessRole;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading: boolean;
  onEdit: () => void;
};

export function UtilitySupplierPanel({
  contact,
  role,
  transactions,
  journalEntries,
  txLoading,
  onEdit,
}: Props) {
  const meta = CONTACT_ROLES[role] || CONTACT_ROLES.OTHER;
  const RoleIcon = meta.icon;
  const openTx = useTxDialog((s) => s.open);
  const { can } = usePermission();
  const mayRecordPayment = canCreateContactTransaction(contact.is_active, can('expense.create'));

  const expenseTxs = getPostedContactTransactions(transactions).filter(
    (t) =>
      (t.contact?.id === contact.id || (t as unknown as { contact_id?: string }).contact_id === contact.id) &&
      (t.kind === 'EXPENSE' || t.kind == null)
  );

  const totalPaid = expenseTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const lastTx = expenseTxs[0];

  const handleRecordPayment = () => {
    if (!mayRecordPayment) return;
    openTx({
      kind: 'EXPENSE',
      contactId: contact.id,
      contactKind: contact.kind,
    });
  };


  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className={cn('rounded-2xl border p-5', meta.borderColor, meta.bgColor)}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-card shadow-xs', meta.color)}>
              <RoleIcon className="h-6 w-6 stroke-[1.8]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{contact.name}</h2>
                <Badge variant="outline" className={cn('font-semibold', meta.borderColor, meta.color)}>
                  {meta.badge}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {contact.shop_number ? `العداد / الوحدة / المعرف: ${contact.shop_number} · ` : ''}
                {contact.department ? `التصنيف: ${contact.department} · ` : ''}
                {contact.phone ? `الهاتف: ${contact.phone}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mayRecordPayment && (
              <Button
                onClick={handleRecordPayment}
                className="gap-1.5 font-semibold text-xs h-9 bg-primary text-primary-foreground shadow-xs"
              >
                <Plus className="h-4 w-4" />
                تسجيل سند صرف / سداد
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onEdit} className="text-xs h-9">
              تعديل البيانات
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">إجمالي المدفوعات المسجلة</span>
          <p className="text-xl font-bold text-foreground font-mono">
            {formatMoney(totalPaid, 'LYD')}
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">كافة الفواتير والسندات</span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">عدد الفواتير والسندات</span>
          <p className="text-xl font-bold text-foreground font-mono">
            {expenseTxs.length} سند
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">سندات صرف معتمدة</span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">آخر عملية سداد</span>
          <p className="text-sm font-bold text-foreground font-mono mt-1">
            {lastTx ? formatDate(lastTx.tx_date) : 'لا توجد'}
          </p>
          <span className="text-[11px] text-muted-foreground block mt-1">
            {lastTx ? `${formatMoney(Number(lastTx.amount), 'LYD')}` : '—'}
          </span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <span className="text-xs text-muted-foreground block mb-1">الرصيد والتعامل</span>
          <Badge className={cn(
            'mt-1',
            contact.is_active
              ? 'bg-success-soft text-success-ink'
              : 'bg-warning-soft text-warning-ink',
          )}>
            {contact.is_active ? 'مورد نشط' : 'ملف غير نشط'}
          </Badge>
          <span className="text-[11px] text-muted-foreground block mt-1">
            {contact.is_active ? 'يمكن تسجيل معاملات جديدة' : 'للعرض والرجوع إلى الحركات السابقة'}
          </span>
        </Card>
      </div>

      {/* 3. Supplier Specs Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold text-foreground">بيانات التوريد والاشتراك</h3>
          </div>
            <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">الاسم باللغة الإنجليزية:</span>
              <span className="font-semibold text-foreground" dir="ltr">{contact.name_en || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">نوع التوريد والخدمة:</span>
              <span className="font-semibold text-foreground">{meta.label}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">رقم العداد / الوحدة / العقد:</span>
              <span className="font-semibold text-foreground font-mono">{contact.shop_number || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">التصنيف أو القسم:</span>
              <span className="font-semibold text-foreground">{contact.department || 'عام'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">الموقع / العنوان:</span>
              <span className="font-semibold text-foreground">{contact.address || '—'}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-border">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold text-foreground">الملاحظات والشروط التعاقدية</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">البريد الإلكتروني:</span>
              <span className="font-semibold text-foreground">{contact.email || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">الهاتف الثانوي:</span>
              <span className="font-semibold text-foreground">{contact.phone2 || '—'}</span>
            </div>
            <div className="py-1.5">
              <span className="text-muted-foreground block mb-1">ملاحظات إضافية:</span>
              <p className="text-foreground bg-muted/30 p-2 rounded-md font-medium">
                {contact.notes || 'لا توجد ملاحظات خاصة مسجلة.'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 4. Complete Financial Ledger & Journal Entries */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          كشف الحساب المالي وسجل القيود والفواتير للمورد
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

