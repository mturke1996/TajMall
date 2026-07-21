'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Ban,
  Loader2,
  AlertTriangle,
  Calendar,
  DollarSign,
  User,
  Store
} from 'lucide-react';
import { MallPanelToolbar } from '@/components/mall/panel-toolbar';
import { WriteGuard } from '@/components/auth/write-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import Link from 'next/link';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { useContacts } from '@/lib/db/queries';
import {
  useLeaseContracts,
  useCreateLeaseContract,
  useTerminateLeaseContract,
  useMallUnits
} from '@/lib/db/mall-queries';

export function MallContractsPanel() {
  const { data: contracts = [], isLoading, isError, error } = useLeaseContracts();
  const { data: contacts = [] } = useContacts();
  const { data: units = [] } = useMallUnits();

  const createContract = useCreateLeaseContract();
  const terminateContract = useTerminateLeaseContract();

  const [isOpen, setIsOpen] = useState(false);

  // Form State
  const [tenantId, setTenantId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [servicesAmount, setServicesAmount] = useState('0');
  const [depositAmount, setDepositAmount] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter available tenants (kind = 'TENANT')
  const tenants = useMemo(() => {
    return contacts.filter((c) => c.kind === 'TENANT' && c.is_active !== false);
  }, [contacts]);

  // Filter available units
  const availableUnits = useMemo(() => {
    return units.filter((u) => u.status === 'AVAILABLE');
  }, [units]);

  const handleOpenCreate = () => {
    setTenantId('');
    setUnitId('');
    setStartDate('');
    setEndDate('');
    setMonthlyRent('');
    setServicesAmount('0');
    setDepositAmount('0');
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !unitId || !startDate || !endDate || !monthlyRent) return;

    setIsSubmitting(true);
    try {
      await createContract.mutateAsync({
        tenant_id: tenantId,
        unit_id: unitId,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: monthlyRent,
        services_amount: servicesAmount,
        deposit_amount: depositAmount,
        status: 'ACTIVE',
      });
      setIsOpen(false);
    } catch (err) {
      // already handled by hook toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTerminate = async (contractId: string, unitId: string) => {
    if (!confirm('هل أنت متأكد من إنهاء هذا عقد الإيجار اليوم؟ سيتم تفريغ المحل وتحديث تواريخ العقد.')) return;
    await terminateContract.mutateAsync({ id: contractId, unitId });
  };

  const getStatusBadge = (s: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ACTIVE: { label: 'ساري وموثق', className: 'border-green-200 bg-green-50 text-green-700' },
      EXPIRED: { label: 'منتهي الصلاحية', className: 'border-slate-200 bg-slate-50 text-slate-600' },
      TERMINATED: { label: 'مفسوخ / ملغي', className: 'border-red-200 bg-red-50 text-red-700' },
    };
    const c = configs[s] || { label: s, className: 'border-slate-200 bg-slate-50 text-slate-700' };
    return (
      <Badge variant="outline" className={`${c.className} font-semibold`}>
        {c.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <MallPanelToolbar>
        <WriteGuard permission="journal.create">
          <Button
            onClick={handleOpenCreate}
            className="h-11 gap-2 bg-sage-700 hover:bg-sage-800 text-white touch-manipulation md:h-9"
          >
            <Plus className="h-4 w-4" />
            توثيق عقد جديد
          </Button>
        </WriteGuard>
      </MallPanelToolbar>

      {/* Contracts Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
              <AlertTriangle className="h-8 w-8" />
              <p className="font-semibold">فشل تحميل عقود الإيجار</p>
              <p className="text-sm text-red-500">{(error as any)?.message}</p>
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-slate-400">
              <FileText className="h-12 w-12 mb-2 opacity-50 text-slate-400" />
              <p className="font-medium text-slate-600">لا توجد عقود إيجار موثقة بعد</p>
              <Button onClick={handleOpenCreate} variant="link" className="text-emerald-700 font-bold">
                اضغط هنا لتوثيق أول عقد إيجار
              </Button>
            </div>
          ) : (
            <>
            <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden sm:hidden">
              {contracts.map((contract) => (
                <li key={contract.id} className="px-3 py-3.5 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {contract.tenant_id ? (
                        <Link
                          href={`/contacts/${contract.tenant_id}`}
                          className="font-semibold text-[15px] hover:text-sage-700"
                        >
                          {contract.tenant?.name || 'مستأجر'}
                        </Link>
                      ) : (
                        <p className="font-semibold">{contract.tenant?.name || '—'}</p>
                      )}
                      <p className="text-[13px] text-ink-mute mt-0.5">
                        محل {contract.unit?.unit_number || '—'}
                      </p>
                    </div>
                    {getStatusBadge(contract.status)}
                  </div>
                  <p className="text-[12px] text-ink-mute mt-2">
                    {formatDate(contract.start_date)} — {formatDate(contract.end_date)}
                  </p>
                  <p className="mt-1 font-bold tabular-nums text-sage-800">
                    {formatMoney(Number(contract.monthly_rent), 'LYD')} / شهر
                  </p>
                  {contract.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-9 w-full text-red-600 touch-manipulation"
                      onClick={() => handleTerminate(contract.id, contract.unit_id)}
                      disabled={terminateContract.isPending}
                    >
                      <Ban className="h-3.5 w-3.5 ml-1" />
                      فسخ العقد
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 pb-3 text-slate-500 font-medium">
                    <th className="pb-3 pr-2 text-right">رقم العقد</th>
                    <th className="pb-3 text-right">المستأجر</th>
                    <th className="pb-3 text-right">المحل</th>
                    <th className="pb-3 text-right">فترة التعاقد</th>
                    <th className="pb-3 text-left">الإيجار الشهري</th>
                    <th className="pb-3 text-left">الصيانة والخدمات</th>
                    <th className="pb-3 text-left">مبلغ التأمين</th>
                    <th className="pb-3 text-right">الحالة</th>
                    <th className="pb-3 pl-2 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contracts.map((contract) => (
                    <tr key={contract.id} className="hover:bg-slate-50/50">
                      <td className="py-4 pr-2 font-mono text-xs text-slate-500" title={contract.id}>
                        {contract.id.slice(0, 8)}...
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {contract.tenant_id ? (
                            <Link
                              href={`/contacts/${contract.tenant_id}`}
                              className="font-bold text-slate-900 hover:text-sage-700 hover:underline"
                            >
                              {contract.tenant?.name || 'مستأجر'}
                            </Link>
                          ) : (
                            <span className="font-bold text-slate-900">
                              {contract.tenant?.name || 'مستأجر غير معروف'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <Store className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700">محل {contract.unit?.unit_number || '-'}</span>
                        </div>
                      </td>
                      <td className="py-4 text-xs text-slate-600 font-mono">
                        من {formatDate(contract.start_date)} إلى {formatDate(contract.end_date)}
                      </td>
                      <td className="py-4 text-left font-mono font-bold text-slate-900">
                        {formatMoney(Number(contract.monthly_rent), 'LYD')}
                      </td>
                      <td className="py-4 text-left font-mono text-slate-600">
                        {Number(contract.services_amount) > 0 ? formatMoney(Number(contract.services_amount), 'LYD') : '-'}
                      </td>
                      <td className="py-4 text-left font-mono text-emerald-800 font-medium">
                        {Number(contract.deposit_amount) > 0 ? formatMoney(Number(contract.deposit_amount), 'LYD') : '-'}
                      </td>
                      <td className="py-4">{getStatusBadge(contract.status)}</td>
                      <td className="py-4 pl-2 text-left">
                        {contract.status === 'ACTIVE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                            onClick={() => handleTerminate(contract.id, contract.unit_id)}
                            disabled={terminateContract.isPending}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            فسخ العقد
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Document New Contract Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>توثيق عقد إيجار تجاري جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant">المستأجر</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger id="tenant">
                  <SelectValue placeholder="اختر مستأجراً من القائمة" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name} {tenant.shop_number ? `(${tenant.shop_number})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">المحل التجاري</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger id="unit">
                  <SelectValue placeholder="اختر محلاً تجارياً متاحاً" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      محل {unit.unit_number} (الدور {unit.floor} - {unit.area_sqm} م²)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date">تاريخ بدء العقد</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">تاريخ انتهاء العقد</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rent">قيمة الإيجار الشهري</Label>
              <div className="relative">
                <Input
                  id="rent"
                  type="number"
                  placeholder="0.00"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  className="pr-8"
                  required
                />
                <DollarSign className="absolute right-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="services">رسوم الصيانة والخدمات الشهرية</Label>
                <Input
                  id="services"
                  type="number"
                  placeholder="0.00"
                  value={servicesAmount}
                  onChange={(e) => setServicesAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit">مبلغ التأمين (مسترد عند الإخلاء)</Label>
                <Input
                  id="deposit"
                  type="number"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="submit" disabled={isSubmitting} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'توثيق العقد وتأمين المحل'
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
