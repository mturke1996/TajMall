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
import { useConfirm } from '@/components/ui/confirm-dialog';
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

  const confirm = useConfirm();

  const handleTerminate = async (contractId: string, unitId: string) => {
    const ok = await confirm({
      title: 'إنهاء عقد الإيجار',
      description: 'ينتهي العقد بتاريخ اليوم، ويصبح المحل متاحاً، ولا تُولَّد مطالبات بعده.',
      confirmLabel: 'أنهِ العقد',
    });
    if (!ok) return;
    await terminateContract.mutateAsync({ id: contractId, unitId });
  };

  const getStatusBadge = (s: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      ACTIVE: { label: 'نشط', className: 'border-success-line bg-success-soft text-success-ink' },
      EXPIRED: { label: 'منتهٍ', className: 'border-border bg-canvas-sunken text-ink-soft' },
      TERMINATED: { label: 'مُنهى', className: 'border-danger-line bg-danger-soft text-danger-ink' },
    };
    const c = configs[s] || { label: s, className: 'border-border bg-canvas-sunken text-ink-soft' };
    return (
      <Badge variant="outline" className={`${c.className} font-semibold`}>
        {c.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <MallPanelToolbar>
        <WriteGuard permission="document.create">
          <Button
            onClick={handleOpenCreate}
            className="h-11 gap-2 bg-foreground hover:bg-foreground text-background touch-manipulation md:h-9"
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
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-danger bg-danger-soft rounded-lg p-4">
              <AlertTriangle className="h-8 w-8" />
              <p className="font-semibold">فشل تحميل عقود الإيجار</p>
              <p className="text-sm text-danger">{(error as any)?.message}</p>
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <FileText className="h-12 w-12 mb-2 opacity-50 text-muted-foreground" />
              <p className="font-medium text-ink-soft">لا توجد عقود إيجار موثقة بعد</p>
              <Button onClick={handleOpenCreate} variant="link" className="text-success-ink font-bold">
                توثيق أول عقد
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
                          className="font-semibold text-[15px] hover:text-foreground"
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
                  <p className="mt-1 font-bold tabular-nums text-foreground">
                    {formatMoney(Number(contract.monthly_rent), 'LYD')} / شهر
                  </p>
                  {contract.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-9 w-full text-ink-soft touch-manipulation"
                      onClick={() => handleTerminate(contract.id, contract.unit_id)}
                      disabled={terminateContract.isPending}
                    >
                      <Ban className="h-3.5 w-3.5 me-1" />
                      إنهاء العقد
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[12.5px] text-ink-mute">
                    <th scope="col" className="px-3 pb-2.5 text-start font-medium">المستأجر</th>
                    <th scope="col" className="px-3 pb-2.5 text-start font-medium">المدة</th>
                    <th scope="col" className="px-3 pb-2.5 text-end font-medium">الإيجار الشهري</th>
                    <th scope="col" className="px-3 pb-2.5 text-end font-medium">الخدمات</th>
                    <th scope="col" className="px-3 pb-2.5 text-end font-medium">التأمين</th>
                    <th scope="col" className="px-3 pb-2.5 text-start font-medium">الحالة</th>
                    <th scope="col" className="px-3 pb-2.5 text-end font-medium">
                      <span className="sr-only">إجراءات</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contracts.map((contract) => {
                    const daysLeft = contract.end_date ? Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86_400_000) : null;
                    const endingSoon = contract.status === 'ACTIVE' && daysLeft != null && daysLeft >= 0 && daysLeft <= 60;
                    return (
                      <tr key={contract.id} className="hover:bg-canvas-sunken/50">
                        <td className="px-3 py-2.5">
                          {contract.tenant_id ? (
                            <Link href={`/contacts/${contract.tenant_id}`} className="font-medium text-foreground hover:underline">
                              {contract.tenant?.name || 'مستأجر'}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{contract.tenant?.name || 'مستأجر غير معروف'}</span>
                          )}
                          <span className="block text-[12px] text-ink-mute">
                            {contract.unit?.unit_number ? `محل ${contract.unit.unit_number}` : 'بلا وحدة'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                          {formatDate(contract.start_date)} — {formatDate(contract.end_date)}
                          {endingSoon && (
                            <span className="block text-[12px] text-warning-ink">
                              {daysLeft === 0 ? 'ينتهي اليوم' : `ينتهي بعد ${daysLeft} يوماً`}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-end font-medium tabular-nums">
                          {formatMoney(Number(contract.monthly_rent), 'LYD')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums text-ink-soft">
                          {Number(contract.services_amount) > 0 ? formatMoney(Number(contract.services_amount), 'LYD') : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-end tabular-nums text-ink-soft">
                          {Number(contract.deposit_amount) > 0 ? formatMoney(Number(contract.deposit_amount), 'LYD') : '—'}
                        </td>
                        <td className="px-3 py-2.5">{getStatusBadge(contract.status)}</td>
                        <td className="px-3 py-2.5 text-end">
                          {contract.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-[12.5px] text-ink-mute hover:bg-danger-soft hover:text-danger-ink"
                              onClick={() => handleTerminate(contract.id, contract.unit_id)}
                              disabled={terminateContract.isPending}
                            >
                              <Ban className="h-3.5 w-3.5" aria-hidden />
                              إنهاء العقد
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                  className="ps-8"
                  required
                />
                <DollarSign className="absolute inset-s-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
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
              <Button type="submit" disabled={isSubmitting}>
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
