'use client';

import { useState } from 'react';
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
  FileSpreadsheet
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
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

export default function TenantChargesPage() {
  const { data: charges = [], isLoading, isError, error } = useTenantCharges();
  const { data: contracts = [] } = useLeaseContracts();
  
  const createCharge = useCreateTenantCharge();
  const generateMonthly = useGenerateMonthlyCharges();

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
      PAID: { label: 'مسدد بالكامل', className: 'border-green-200 bg-green-50 text-green-700', icon: CheckCircle },
      PARTIAL: { label: 'مسدد جزئياً', className: 'border-yellow-200 bg-yellow-50 text-yellow-700', icon: Clock },
      UNPAID: { label: 'مستحق الدفع', className: 'border-red-200 bg-red-50 text-red-700', icon: XCircle },
    };
    const c = configs[s] || { label: s, className: 'border-slate-200 bg-slate-50 text-slate-700', icon: Clock };
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="إدارة المول"
        title="المطالبات والرسوم"
        description="تسجيل ومتابعة استحقاق إيجارات ورسوم المحلات التجارية، والمطالبة التلقائية ببداية الأشهر"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleOpenGenerate}
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <RefreshCw className="h-4 w-4" />
              توليد الفواتير الشهرية
            </Button>
            <Button
              onClick={handleOpenCreate}
              className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Plus className="h-4 w-4" />
              إنشاء مطالبة يدوية
            </Button>
          </div>
        }
      />

      {/* Charges Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
              <AlertTriangle className="h-8 w-8" />
              <p className="font-semibold">فشل تحميل المطالبات المالية</p>
              <p className="text-sm text-red-500">{(error as any)?.message}</p>
            </div>
          ) : charges.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-400">
              <Coins className="h-12 w-12 mb-2 opacity-50 text-slate-400" />
              <p className="font-medium text-slate-600">لا توجد مطالبات أو رسوم مستحقة بعد</p>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleOpenGenerate} variant="outline" className="text-emerald-700 font-bold border-emerald-200 hover:bg-emerald-50">
                  توليد المطالبات لشهر جاري
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 pb-3 text-slate-500 font-medium">
                    <th className="pb-3 pr-2 text-right">المستأجر</th>
                    <th className="pb-3 text-right">المحل</th>
                    <th className="pb-3 text-right">نوع الرسوم</th>
                    <th className="pb-3 text-right">البيان</th>
                    <th className="pb-3 text-right">تاريخ الاستحقاق</th>
                    <th className="pb-3 text-left">قيمة المطالبة</th>
                    <th className="pb-3 text-left">المبلغ المدفوع</th>
                    <th className="pb-3 text-right">الحالة</th>
                    <th className="pb-3 pl-2 text-right">رقم القيد اليومي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {charges.map((charge) => (
                    <tr key={charge.id} className="hover:bg-slate-50/50">
                      <td className="py-4 pr-2">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-bold text-slate-900">
                            {charge.contract?.tenant?.name || 'مستأجر غير معروف'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="font-medium text-slate-700">محل {charge.contract?.unit?.unit_number || '-'}</span>
                      </td>
                      <td className="py-4">
                        <Badge variant="outline" className="font-medium text-slate-600 bg-slate-50">
                          {getTypeLabel(charge.type)}
                        </Badge>
                      </td>
                      <td className="py-4 text-slate-700 max-w-xs truncate" title={charge.description}>
                        {charge.description}
                      </td>
                      <td className="py-4 text-xs text-slate-600 font-mono">
                        {formatDate(charge.due_date)}
                      </td>
                      <td className="py-4 text-left font-mono font-bold text-slate-900">
                        {formatMoney(Number(charge.amount), 'LYD')}
                      </td>
                      <td className="py-4 text-left font-mono text-emerald-800">
                        {Number(charge.total_paid) > 0 ? formatMoney(Number(charge.total_paid), 'LYD') : '-'}
                      </td>
                      <td className="py-4">{getStatusBadge(charge.status)}</td>
                      <td className="py-4 pl-2 text-left font-mono text-xs text-slate-400">
                        {charge.journal_entry_id ? `#${charge.journal_entry_id.slice(0, 8)}` : 'جاري الترحيل...'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                  className="pr-8"
                  required
                />
                <DollarSign className="absolute right-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
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
              <Button type="submit" disabled={isSubmitting} className="bg-emerald-700 hover:bg-emerald-800 text-white">
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
                <Calendar className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="submit" disabled={isGenerating} className="bg-emerald-700 hover:bg-emerald-800 text-white">
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
