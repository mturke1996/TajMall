'use client';

import { useState, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  Loader2, 
  DollarSign, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Clock,
  Plus,
  ArrowUpRight
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTenantRentSummary, useRecordRentPayment, useCashboxes } from '@/lib/db/queries';
import { toast } from 'sonner';
import { cn, formatMoney } from '@/lib/utils';
import Link from 'next/link';

const STATUS_CONFIG = {
  paid_full: { 
    label: 'مسدد بالكامل', 
    icon: CheckCircle2, 
    color: 'text-green-600', 
    bg: 'bg-green-50',
    border: 'border-green-200'
  },
  paid_partial: { 
    label: 'مسدد جزئياً', 
    icon: Clock, 
    color: 'text-yellow-600', 
    bg: 'bg-yellow-50',
    border: 'border-yellow-200'
  },
  unpaid: { 
    label: 'غير مسدد', 
    icon: XCircle, 
    color: 'text-red-600', 
    bg: 'bg-red-50',
    border: 'border-red-200'
  },
  no_rent_set: { 
    label: 'لم يحدد الإيجار', 
    icon: AlertCircle, 
    color: 'text-gray-500', 
    bg: 'bg-gray-50',
    border: 'border-gray-200'
  },
};

export default function TenantsPage() {
  const { data: tenants = [], isLoading } = useTenantRentSummary();
  const { data: cashboxes = [] } = useCashboxes();
  const recordPayment = useRecordRentPayment();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | 'ALL'>('ALL');
  const [selectedTenant, setSelectedTenant] = useState<typeof tenants[0] | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      if (statusFilter !== 'ALL' && t.current_month_status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.shop_number?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q)
      );
    });
  }, [tenants, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = tenants.length;
    const paid = tenants.filter(t => t.current_month_status === 'paid_full').length;
    const partial = tenants.filter(t => t.current_month_status === 'paid_partial').length;
    const unpaid = tenants.filter(t => t.current_month_status === 'unpaid').length;
    const noRent = tenants.filter(t => t.current_month_status === 'no_rent_set').length;
    
    const expectedTotal = tenants.reduce((sum, t) => sum + (Number(t.monthly_rent) || 0), 0);
    const collectedTotal = tenants.reduce((sum, t) => sum + Number(t.current_month_paid), 0);
    
    return { total, paid, partial, unpaid, noRent, expectedTotal, collectedTotal };
  }, [tenants]);

  async function handleRecordPayment() {
    if (!selectedTenant || !paymentAmount) return;
    
    try {
      await recordPayment.mutateAsync({
        tenant_id: selectedTenant.id,
        amount: Number(paymentAmount),
      });
      toast.success('تم تسجيل الدفع بنجاح');
      setSelectedTenant(null);
      setPaymentAmount('');
    } catch {
      toast.error('فشل تسجيل الدفع');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="إدارة المستأجرين"
        title="المحلات والإيجارات"
        description="متابعة حالة الإيجارات وتسجيل المدفوعات"
        actions={
          <Button size="sm" asChild>
            <Link href="/contacts">
              <Plus className="h-4 w-4 mr-1" />
              إضافة مستأجر
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4 bg-gradient-to-br from-green-50 to-white border-green-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">مسدد بالكامل</p>
                <p className="text-2xl font-bold text-green-700">{stats.paid}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-yellow-50 to-white border-yellow-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">مسدد جزئياً</p>
                <p className="text-2xl font-bold text-yellow-700">{stats.partial}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-red-50 to-white border-red-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">غير مسدد</p>
                <p className="text-2xl font-bold text-red-700">{stats.unpaid}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-sage-50 to-white border-sage-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-sage-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-sage-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">التحصيل هذا الشهر</p>
                <p className="text-lg font-bold text-sage-700">
                  {formatMoney(stats.collectedTotal, 'LYD')} / {formatMoney(stats.expectedTotal, 'LYD')}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <Input
              placeholder="البحث بالاسم، رقم المحل، الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'px-3 py-2 text-sm rounded-md whitespace-nowrap',
                statusFilter === 'ALL' ? 'bg-sage-700 text-white' : 'bg-canvas-sunken'
              )}
            >
              الكل ({stats.total})
            </button>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'px-3 py-2 text-sm rounded-md whitespace-nowrap flex items-center gap-1.5',
                  statusFilter === key ? 'bg-sage-700 text-white' : 'bg-canvas-sunken'
                )}
              >
                <config.icon className="h-3.5 w-3.5" />
                {config.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tenants Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          </div>
        ) : filteredTenants.length === 0 ? (
          <Card className="p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-ink-mute" />
            <p className="mt-2 text-ink-mute">لا يوجد مستأجرين</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTenants.map((tenant) => {
              const status = STATUS_CONFIG[tenant.current_month_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.no_rent_set;
              const StatusIcon = status.icon;
              const rent = Number(tenant.monthly_rent) || 0;
              const paid = Number(tenant.current_month_paid) || 0;
              const remaining = Math.max(0, rent - paid);
              
              return (
                <Card 
                  key={tenant.id} 
                  className={cn(
                    "overflow-hidden transition-all hover:shadow-lg",
                    tenant.current_month_status === 'unpaid' && 'border-red-300'
                  )}
                >
                  {/* Header with status */}
                  <div className={cn("px-4 py-3 border-b flex items-center justify-between", status.bg, status.border)}>
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("h-5 w-5", status.color)} />
                      <span className={cn("text-sm font-medium", status.color)}>{status.label}</span>
                    </div>
                    <span className="text-xs text-gray-500">الشهر الحالي</span>
                  </div>
                  
                  <div className="p-4">
                    {/* Tenant info */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="h-12 w-12 rounded-xl bg-sage-100 flex items-center justify-center shrink-0">
                        <Building2 className="h-6 w-6 text-sage-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{tenant.name}</h3>
                        <p className="text-sm text-gray-500">
                          {tenant.shop_number ? `محل ${tenant.shop_number}` : '—'}
                          {tenant.floor && ` · الطابق ${tenant.floor}`}
                        </p>
                      </div>
                    </div>
                    
                    {/* Rent details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                        <span className="text-gray-600">الإيجار الشهري</span>
                        <span className="font-medium">{rent > 0 ? formatMoney(rent, 'LYD') : '—'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                        <span className="text-gray-600">المسدد</span>
                        <span className={cn("font-medium", paid > 0 ? 'text-green-600' : '')}>
                          {formatMoney(paid, 'LYD')}
                        </span>
                      </div>
                      {remaining > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-gray-600">المتبقي</span>
                          <span className="font-medium text-red-600">{formatMoney(remaining, 'LYD')}</span>
                        </div>
                      )}
                      {tenant.phone && (
                        <div className="flex items-center gap-2 py-1 text-gray-500">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{tenant.phone}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t flex gap-2">
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setSelectedTenant(tenant)}
                        disabled={rent === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        تسجيل دفع
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        asChild
                        className="flex-1"
                      >
                        <Link href={`/contacts?id=${tenant.id}`}>
                          <ArrowUpRight className="h-4 w-4 mr-1" />
                          التفاصيل
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!selectedTenant} onOpenChange={() => setSelectedTenant(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل دفع إيجار</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-4 py-2">
              <div className="bg-sage-50 p-3 rounded-lg">
                <p className="font-medium">{selectedTenant.name}</p>
                <p className="text-sm text-gray-600">
                  محل {selectedTenant.shop_number || '—'}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">الإيجار الشهري</p>
                  <p className="font-semibold">{formatMoney(Number(selectedTenant.monthly_rent) || 0, 'LYD')}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">المسدد هذا الشهر</p>
                  <p className="font-semibold">{formatMoney(Number(selectedTenant.current_month_paid), 'LYD')}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">المبلغ المدفوع</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-lg"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setSelectedTenant(null)}
                >
                  إلغاء
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleRecordPayment}
                  disabled={!paymentAmount || recordPayment.isPending}
                >
                  {recordPayment.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'تسجيل الدفع'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
