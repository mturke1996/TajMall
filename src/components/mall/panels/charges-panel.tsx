'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Coins,
  Plus,
  Loader2,
  AlertTriangle,
  Calendar,
  DollarSign,
  User,
  Store,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Search,
} from 'lucide-react';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import {
  useTenantCharges,
  useCreateTenantCharge,
  useGenerateMonthlyCharges,
  useLeaseContracts
} from '@/lib/db/mall-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { chargeToInvoiceModel } from '@/lib/charge-invoice';
import { useSyncOverdueChargeReminders } from '@/lib/db/notification-queries';
import { WriteGuard } from '@/components/auth/write-guard';
import { useHighlightScroll, isHighlighted } from '@/lib/hooks/use-highlight-scroll';
import { matchesSearch } from '@/lib/arabic-search';
import { friendlyError } from '@/lib/user-messages';
import { formatMonthLabelAr } from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';

function chargeHighlightDomId(id: string) {
  return `tenant-charge-${id}`;
}

const STATUS_FILTERS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'OPEN', label: 'غير مسدّدة' },
  { value: 'PARTIAL', label: 'جزئية' },
  { value: 'PAID', label: 'مسدّدة' },
] as const;

/** "إيجار شهر 2026-01" → "إيجار شهر يناير 2026" */
function readableDescription(text: string | null | undefined) {
  return (text ?? '').replace(/(20\d{2})-(0[1-9]|1[0-2])(?!-)/g, (m) => formatMonthLabelAr(m));
}

function unitLabel(charge: TenantChargeWithRelations) {
  const unit = charge.contract?.unit?.unit_number;
  return unit ? `محل ${unit}` : 'بلا وحدة';
}

function ChargePdfButton({ charge }: { charge: TenantChargeWithRelations }) {
  return (
    <TajMallPdfToolbar
      className="inline-flex shrink-0"
      showDownload={false}
      openLabel="الفاتورة"
      fileName={`فاتورة-${charge.id.slice(0, 8)}`}
      render={async () => {
        const { TenantChargeInvoicePDF } = await import('@/features/pdf/TenantChargeInvoicePDF');
        return <TenantChargeInvoicePDF charge={chargeToInvoiceModel(charge)} />;
      }}
    />
  );
}

export function MallChargesPanel() {
  const highlightId = useSearchParams().get('highlight');
  const { data: charges = [], isLoading, isError, error } = useTenantCharges();
  const { data: contracts = [] } = useLeaseContracts();
  
  const createCharge = useCreateTenantCharge();
  const generateMonthly = useGenerateMonthlyCharges();
  const syncReminders = useSyncOverdueChargeReminders();

  const [isOpen, setIsOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);

  // Manual Charge Form State
  const [contractId, setContractId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState<'RENT' | 'SERVICE' | 'FINE' | 'OTHER'>('RENT');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate Charges Form State
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });
  const [isGenerating, setIsGenerating] = useState(false);

  useHighlightScroll(highlightId, chargeHighlightDomId, [charges.length]);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['value']>('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const monthOptions = useMemo(
    () => [...new Set(charges.map((c) => c.due_date?.slice(0, 7)).filter(Boolean))].sort().reverse() as string[],
    [charges],
  );
  const visible = useMemo(
    () =>
      charges.filter(
        (c) =>
          (statusFilter === 'ALL' || (statusFilter === 'OPEN' ? c.status !== 'PAID' : c.status === statusFilter)) &&
          (monthFilter === 'ALL' || c.due_date?.startsWith(monthFilter)) &&
          (typeFilter === 'ALL' || c.type === typeFilter) &&
          matchesSearch(query, [c.contract?.tenant?.name, c.contract?.unit?.unit_number, c.description]),
      ),
    [charges, statusFilter, monthFilter, typeFilter, query],
  );
  const totals = useMemo(() => {
    const amount = visible.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const paid = visible.reduce((s, c) => s + (Number(c.total_paid) || 0), 0);
    return { amount, paid, remaining: Math.max(amount - paid, 0) };
  }, [visible]);

  const handleOpenCreate = () => {
    setContractId('');
    setAmount('');
    setDueDate('');
    setType('RENT');
    setDescription('');
    setIsOpen(true);
  };

  const handleOpenGenerate = () => {
    setIsGenerateOpen(true);
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractId || !amount || !dueDate || !description) return;

    setIsSubmitting(true);
    try {
      await createCharge.mutateAsync({
        contract_id: contractId,
        amount,
        due_date: dueDate,
        type,
        description,
      });
      setIsOpen(false);
    } catch (err) {
      // handled in hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateMonthly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMonth) return;

    setIsGenerating(true);
    try {
      await generateMonthly.mutateAsync(targetMonth);
      setIsGenerateOpen(false);
    } catch (err) {
      // handled in hook
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusBadge = (s: string) => {
    const configs: Record<string, { label: string; className: string; icon: any }> = {
      PAID: { label: 'مسدد بالكامل', className: 'border-success-line bg-success-soft text-success-ink', icon: CheckCircle },
      PARTIAL: { label: 'مسدد جزئياً', className: 'border-warning-line bg-warning-soft text-warning-ink', icon: Clock },
      UNPAID: { label: 'مستحق الدفع', className: 'border-danger-line bg-danger-soft text-danger-ink', icon: XCircle },
    };
    const c = configs[s] || { label: s, className: 'border-border bg-canvas-sunken text-ink-soft', icon: Clock };
    const Icon = c.icon;
    return (
      <Badge variant="outline" className={`${c.className} font-semibold gap-1`}>
        <Icon className="h-3 w-3" />
        {c.label}
      </Badge>
    );
  };

  const getTypeLabel = (t: string) => {
    const labels: Record<string, string> = {
      RENT: 'إيجار محل',
      SERVICE: 'خدمات وصيانة',
      FINE: 'غرامة مالية',
      OTHER: 'رسوم أخرى'
    };
    return labels[t] || t;
  };

  return (
    <div className="space-y-4">
      <MallPanelToolbar className="justify-stretch sm:justify-end">
        <WriteGuard permission="revenue.create">
          <Button
            variant="outline"
            onClick={() => syncReminders.mutate()}
            disabled={syncReminders.isPending}
            className="h-11 flex-1 gap-2 touch-manipulation sm:flex-none md:h-9"
          >
            <Clock className="h-4 w-4" />
            تذكير المتأخرات
          </Button>
          <Button
            variant="outline"
            onClick={handleOpenGenerate}
            className="h-11 flex-1 gap-2 border-border text-foreground touch-manipulation sm:flex-none md:h-9"
          >
            <RefreshCw className="h-4 w-4" />
            توليد الفواتير
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="h-11 flex-1 gap-2 bg-foreground hover:bg-foreground text-background touch-manipulation sm:flex-none md:h-9"
          >
            <Plus className="h-4 w-4" />
            مطالبة يدوية
          </Button>
        </WriteGuard>
      </MallPanelToolbar>

      {/* Charges list */}
      {isLoading ? (
        <Card className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-ink-soft" aria-label="جارٍ التحميل" />
        </Card>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-2 border-danger-line bg-danger-soft p-8 text-center text-danger-ink">
          <AlertTriangle className="h-7 w-7" aria-hidden />
          <p className="font-semibold">تعذّر تحميل المطالبات</p>
          <p className="text-[13px]">{friendlyError(error)}</p>
        </Card>
      ) : charges.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Coins className="h-9 w-9 text-ink-mute" aria-hidden />
          <p className="font-medium text-ink-soft">لا توجد مطالبات بعد</p>
          <WriteGuard permission="revenue.create">
            <Button onClick={handleOpenGenerate} variant="outline" size="sm">
              توليد مطالبات الشهر الحالي
            </Button>
          </WriteGuard>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3 p-3 sm:p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="بحث باسم المستأجر أو المحل أو البيان…"
                  aria-label="بحث في المطالبات"
                  className="h-10 ps-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="حالة المطالبة">
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={statusFilter === f.value}
                      onClick={() => setStatusFilter(f.value)}
                      className={cn(
                        'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                        statusFilter === f.value ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="h-9 w-40" aria-label="شهر الاستحقاق">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كل الأشهر</SelectItem>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {formatMonthLabelAr(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-9 w-36" aria-label="نوع الرسم">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كل الأنواع</SelectItem>
                    {(['RENT', 'SERVICE', 'FINE', 'OTHER'] as const).map((t) => (
                      <SelectItem key={t} value={t}>
                        {getTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[12.5px] text-ink-mute tabular-nums">
              {visible.length} مطالبة · القيمة {formatMoney(totals.amount, 'LYD')} · المسدّد {formatMoney(totals.paid, 'LYD')} ·{' '}
              <span className={cn(totals.remaining > 0 && 'font-medium text-danger-ink')}>المتبقي {formatMoney(totals.remaining, 'LYD')}</span>
            </p>
          </Card>

          {visible.length === 0 ? (
            <Card className="p-8 text-center text-[13px] text-ink-mute">لا توجد مطالبات تطابق التصفية.</Card>
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border md:hidden">
                {visible.map((charge) => {
                  const remaining = Math.max(Number(charge.amount) - Number(charge.total_paid), 0);
                  return (
                    <li
                      key={charge.id}
                      id={chargeHighlightDomId(charge.id)}
                      className={cn('scroll-mt-28 bg-card px-3 py-3', isHighlighted(highlightId, charge.id) && 'ring-2 ring-inset ring-ink-soft')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold">{charge.contract?.tenant?.name || 'مستأجر'}</p>
                          <p className="text-[12.5px] text-ink-mute">
                            {unitLabel(charge)} · {readableDescription(charge.description)}
                          </p>
                        </div>
                        {getStatusBadge(charge.status)}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[12.5px] text-ink-mute">
                          <span className="font-semibold tabular-nums text-foreground">{formatMoney(Number(charge.amount), 'LYD')}</span>
                          {remaining > 0 && Number(charge.total_paid) > 0 && <> · متبقٍ {formatMoney(remaining, 'LYD')}</>}
                          {' · '}
                          {formatDate(charge.due_date)}
                        </span>
                        <ChargePdfButton charge={charge} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-canvas-sunken text-[12.5px] text-ink-mute">
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">المستأجر</th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">البيان</th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">الاستحقاق</th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">القيمة</th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">المسدّد</th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">المتبقي</th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">الحالة</th>
                      <th scope="col" className="px-4 py-2.5 text-end font-medium">
                        <span className="sr-only">فاتورة</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((charge) => {
                      const paid = Number(charge.total_paid) || 0;
                      const remaining = Math.max(Number(charge.amount) - paid, 0);
                      return (
                        <tr
                          key={charge.id}
                          id={chargeHighlightDomId(charge.id)}
                          className={cn('scroll-mt-28 hover:bg-canvas-sunken/50', isHighlighted(highlightId, charge.id) && 'bg-canvas-sunken ring-2 ring-inset ring-ink-soft')}
                        >
                          <td className="px-4 py-2.5">
                            <span className="block font-medium text-foreground">{charge.contract?.tenant?.name || 'مستأجر غير معروف'}</span>
                            <span className="block text-[12px] text-ink-mute">{unitLabel(charge)}</span>
                          </td>
                          <td className="max-w-xs px-4 py-2.5" title={charge.description}>
                            <span className="block truncate text-foreground">{readableDescription(charge.description)}</span>
                            <span className="block text-[12px] text-ink-mute">{getTypeLabel(charge.type)}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{formatDate(charge.due_date)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-end font-medium tabular-nums">{formatMoney(Number(charge.amount), 'LYD')}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-end tabular-nums text-ink-soft">{paid > 0 ? formatMoney(paid, 'LYD') : '—'}</td>
                          <td className={cn('whitespace-nowrap px-4 py-2.5 text-end tabular-nums', remaining > 0 ? 'font-medium text-danger-ink' : 'text-ink-mute')}>
                            {remaining > 0 ? formatMoney(remaining, 'LYD') : '—'}
                          </td>
                          <td className="px-4 py-2.5">{getStatusBadge(charge.status)}</td>
                          <td className="px-4 py-2.5 text-end">
                            <ChargePdfButton charge={charge} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Manual Single Charge Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>إنشاء مطالبة مالية جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitManual} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contract">عقد الإيجار المرتبط</Label>
              <Select value={contractId} onValueChange={setContractId}>
                <SelectTrigger id="contract">
                  <SelectValue placeholder="اختر العقد الخاص بالمستأجر" />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      محل {c.unit?.unit_number} - المستأجر {c.tenant?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="charge-type">نوع الرسم</Label>
                <Select value={type} onValueChange={(val: any) => setType(val)}>
                  <SelectTrigger id="charge-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RENT">إيجار محل</SelectItem>
                    <SelectItem value="SERVICE">خدمات وصيانة</SelectItem>
                    <SelectItem value="FINE">غرامة مالية</SelectItem>
                    <SelectItem value="OTHER">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-date">تاريخ الاستحقاق</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="charge-amount">المبلغ المستحق</Label>
              <div className="relative">
                <Input
                  id="charge-amount"
                  type="number"
                  step="0.001"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="ps-8"
                  required
                />
                <DollarSign className="absolute inset-s-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">الوصف والبيان</Label>
              <Input
                id="description"
                placeholder="مثال: فاتورة صيانة التكييف المركزي لشهر يونيو"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'تسجيل المطالبة وترحيلها'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate Monthly Charges Dialog */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>توليد مطالبات الإيجار والخدمات الدورية</DialogTitle>
            <CardDescription>
              سيقوم النظام بمسح عقود الإيجار النشطة وتوليد الفواتير التلقائية للشهر المحدد إذا لم تكن موجودة بالفعل.
            </CardDescription>
          </DialogHeader>
          <form onSubmit={handleGenerateMonthly} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-month">الشهر المستهدف للفواتير</Label>
              <div className="relative">
                <Input
                  id="target-month"
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  required
                />
                <Calendar className="absolute inset-e-3 top-2.5 h-4.5 w-4.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'توليد الفواتير الآن'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsGenerateOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
