'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Briefcase,
  User,
  Store,
  Phone,
  Loader2,
  Edit2,
  FileText,
  Receipt,
  BookOpen,
  Plus,
  Banknote,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useContact,
  useContactTransactions,
  useTenantRentForContact,
  useUpdateContact,
} from '@/lib/db/queries';
import { useJournalEntries } from '@/lib/db/journal-queries';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import type { ContactKind } from '@/lib/db/types';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  ContactFormDialog,
  KIND_OPTIONS,
} from '@/components/contacts/contact-form-dialog';
import {
  buildContactPayload,
  contactToFormState,
  defaultContactFormState,
  formatContactSaveError,
  type ContactFormState,
} from '@/lib/contacts/form-utils';
import { toast } from 'sonner';
import { RecordRentPaymentDialog } from '@/components/tenants/record-rent-payment-dialog';
import { TenantRentHistory } from '@/components/tenants/tenant-rent-history';
import { getTenantStatus } from '@/components/tenants/tenant-status-config';

const KIND_ICON: Record<ContactKind, typeof Building2> = {
  TENANT: Building2,
  EMPLOYEE: Briefcase,
  CUSTOMER: User,
  VENDOR: Store,
  OTHER: User,
};

export default function ContactDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const { data: contact, isLoading, isError } = useContact(id);
  const { data: transactions = [], isLoading: txLoading } = useContactTransactions(id);
  const { data: rent } = useTenantRentForContact(id);
  const { data: journalEntries = [], isLoading: jeLoading } = useJournalEntries({
    contactId: id,
    status: 'ALL',
  });
  const updateContact = useUpdateContact();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [formData, setFormData] = useState<ContactFormState>(defaultContactFormState());

  const rentPaymentsCount = useMemo(
    () => transactions.filter((t) => t.kind === 'REVENUE').length,
    [transactions],
  );

  const totals = useMemo(() => {
    const revenue = transactions
      .filter((t) => t.kind === 'REVENUE')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = transactions
      .filter((t) => t.kind === 'EXPENSE')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return { revenue, expense, net: revenue - expense };
  }, [transactions]);

  function openEdit() {
    if (!contact) return;
    setFormData(contactToFormState(contact));
    setIsEditOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error('أدخل الاسم');
      return;
    }
    try {
      await updateContact.mutateAsync({
        id,
        ...buildContactPayload(formData),
      });
      toast.success('تم التحديث');
      setIsEditOpen(false);
    } catch (err) {
      console.error('[contacts] update failed', err);
      toast.error(formatContactSaveError(err));
    }
  }

  if (!id) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-ink-mute">رابط غير صالح</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/contacts">العودة للدليل</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-ink-mute">
        <Loader2 className="h-5 w-5 animate-spin" />
        جارٍ التحميل…
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-ink-mute">لم يُعثر على السجل</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/contacts">العودة للدليل</Link>
        </Button>
      </div>
    );
  }

  const kindInfo = KIND_OPTIONS.find((k) => k.value === contact.kind);
  const Icon = KIND_ICON[contact.kind] ?? User;
  const isTenant = contact.kind === 'TENANT';
  const rentStatus = rent?.current_month_status
    ? getTenantStatus(rent.current_month_status)
    : null;
  const monthlyRent = Number(contact.monthly_rent) || 0;
  const canRecordRent = isTenant && monthlyRent > 0;

  return (
    <>
      <PageHeader
        eyebrow={kindInfo?.label ?? 'جهة تعامل'}
        title={contact.name}
        description={
          contact.shop_number
            ? `محل ${contact.shop_number}${contact.floor ? ` · الطابق ${contact.floor}` : ''}`
            : contact.code
              ? `الرمز: ${contact.code}`
              : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={contact.kind === 'TENANT' ? '/tenants' : '/contacts'}>
                <ArrowRight className="h-4 w-4 ml-1" />
                رجوع
              </Link>
            </Button>
            <TajMallPdfToolbar
              fileName={`ملف-${contact.name}-${new Date().toISOString().slice(0, 10)}`}
              render={async () => {
                const { ContactDossierPDF } = await import('@/features/pdf/ContactDossierPDF');
                return (
                  <ContactDossierPDF
                    contact={contact}
                    rent={rent ?? null}
                    transactions={transactions}
                    journalEntries={journalEntries}
                  />
                );
              }}
            />
            {canRecordRent && rent && (
              <Button size="sm" onClick={() => setIsPayOpen(true)}>
                <Plus className="h-4 w-4 ml-1" />
                تسجيل دفع
              </Button>
            )}
            <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={openEdit}>
              <Edit2 className="h-4 w-4 ml-1" />
              تعديل
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {/* ملخص */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {isTenant && rent && (
            <Card className="p-4 col-span-2 sm:col-span-1 lg:col-span-1 border-sage-200 bg-sage-50/50">
              <p className="text-xs text-ink-mute">إيجارات 12 شهر</p>
              <p className="text-xl font-bold text-sage-800">
                {formatMoney(Number(rent.last_12_months_revenue), 'LYD')}
              </p>
            </Card>
          )}
          <Card className="p-4">
            <p className="text-xs text-ink-mute">إجمالي الإيرادات</p>
            <p className="text-xl font-bold text-green-600">
              {formatMoney(totals.revenue, 'LYD')}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-mute">إجمالي المصروفات</p>
            <p className="text-xl font-bold text-red-600">
              {formatMoney(totals.expense, 'LYD')}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-mute">عدد المعاملات</p>
            <p className="text-xl font-bold">{transactions.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-mute">قيود اليومية</p>
            <p className="text-xl font-bold">{journalEntries.length}</p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-sage-100 flex items-center justify-center">
                <Icon className={cn('h-6 w-6', kindInfo?.color)} />
              </div>
              <div>
                <Badge variant="outline">{kindInfo?.label}</Badge>
                {contact.code && (
                  <p className="text-xs text-ink-mute mt-1">{contact.code}</p>
                )}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              {contact.phone && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> هاتف
                  </dt>
                  <dd>{contact.phone}</dd>
                </div>
              )}
              {contact.monthly_rent && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">إيجار شهري</dt>
                  <dd className="font-medium">
                    {formatMoney(Number(contact.monthly_rent), 'LYD')}
                  </dd>
                </div>
              )}
              {rent && rentStatus && (
                <div className="flex justify-between gap-2 items-center">
                  <dt className="text-ink-mute">إيجار الشهر</dt>
                  <dd className={cn('flex items-center gap-1 font-medium', rentStatus.color)}>
                    <rentStatus.icon className="h-4 w-4" />
                    {rentStatus.label}
                  </dd>
                </div>
              )}
              {rent && Number(rent.monthly_rent) > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">المسدد هذا الشهر</dt>
                  <dd>{formatMoney(Number(rent.current_month_paid), 'LYD')}</dd>
                </div>
              )}
              {!contact.phone &&
                !contact.monthly_rent &&
                !contact.shop_number && (
                  <p className="text-ink-mute text-xs">
                    بيانات ناقصة — يمكن إكمالها من «تعديل»
                  </p>
                )}
            </dl>
            {isTenant && (
              <div className="mt-4 flex flex-col gap-2">
                {canRecordRent && rent && (
                  <Button className="w-full" size="sm" onClick={() => setIsPayOpen(true)}>
                    <Plus className="h-4 w-4 ml-1" />
                    تسجيل دفع إيجار
                  </Button>
                )}
                <Button className="w-full" size="sm" variant="outline" asChild>
                  <Link href="/tenants">قائمة المستأجرين</Link>
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4 lg:col-span-2 min-w-0">
            <Tabs
              defaultValue={isTenant ? 'rent' : 'transactions'}
              dir="rtl"
            >
              <TabsList className="w-full justify-start mb-4 flex-wrap h-auto gap-1 p-1">
                {isTenant && (
                  <TabsTrigger value="rent" className="gap-1.5 text-xs sm:text-sm">
                    <Banknote className="h-4 w-4" />
                    مدفوعات الإيجار ({rentPaymentsCount})
                  </TabsTrigger>
                )}
                <TabsTrigger value="transactions" className="gap-1.5 text-xs sm:text-sm">
                  <Receipt className="h-4 w-4" />
                  المعاملات ({transactions.length})
                </TabsTrigger>
                <TabsTrigger value="journals" className="gap-1.5 text-xs sm:text-sm">
                  <BookOpen className="h-4 w-4" />
                  قيود ({journalEntries.length})
                </TabsTrigger>
              </TabsList>

              {isTenant && (
                <TabsContent value="rent">
                  <TenantRentHistory tenantId={id} />
                </TabsContent>
              )}

              <TabsContent value="transactions">
                {txLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-sm text-ink-mute py-6 text-center">
                    لا توجد معاملات مرتبطة بهذه الجهة
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-ink-mute text-right">
                          <th className="py-2 pr-2">التاريخ</th>
                          <th className="py-2">النوع</th>
                          <th className="py-2">الحساب</th>
                          <th className="py-2 pl-2 text-left">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.id} className="border-b border-border/60">
                            <td className="py-2.5 pr-2">{formatDate(tx.tx_date)}</td>
                            <td className="py-2.5">
                              <span
                                className={cn(
                                  'text-xs font-medium',
                                  tx.kind === 'REVENUE'
                                    ? 'text-green-600'
                                    : 'text-red-600',
                                )}
                              >
                                {tx.kind === 'REVENUE' ? 'إيراد' : 'مصروف'}
                              </span>
                            </td>
                            <td className="py-2.5 text-ink-mute">
                              {tx.category?.name_ar ?? '—'}
                            </td>
                            <td className="py-2.5 pl-2 text-left font-medium">
                              {formatMoney(Number(tx.amount), tx.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="journals">
                {jeLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
                  </div>
                ) : journalEntries.length === 0 ? (
                  <p className="text-sm text-ink-mute py-6 text-center">
                    لا توجد قيود يومية مرتبطة
                  </p>
                ) : (
                  <div className="space-y-2">
                    {journalEntries.map((je) => (
                      <div
                        key={je.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-ink-mute shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              قيد #{je.number}
                              {je.description ? ` — ${je.description}` : ''}
                            </p>
                            <p className="text-xs text-ink-mute">
                              {formatDate(je.entry_date)} ·{' '}
                              {je.status === 'POSTED'
                                ? 'مرحل'
                                : je.status === 'DRAFT'
                                  ? 'مسودة'
                                  : 'معكوس'}
                            </p>
                          </div>
                        </div>
                        <div className="text-left shrink-0 mr-2">
                          <p className="font-medium text-sm">
                            {formatMoney(Number(je.total_debit), 'LYD')}
                          </p>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                            <Link href="/journals">عرض في الدفتر</Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      <ContactFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        formData={formData}
        onFormChange={setFormData}
        editingId={id}
        onSubmit={handleSubmit}
        isPending={updateContact.isPending}
      />

      {isTenant && rent && (
        <RecordRentPaymentDialog
          tenant={rent}
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
        />
      )}
    </>
  );
}
