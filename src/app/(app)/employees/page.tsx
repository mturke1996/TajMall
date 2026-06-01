'use client';

import { useState, useMemo } from 'react';
import { 
  Briefcase, 
  Search, 
  Loader2, 
  DollarSign, 
  Phone, 
  Calendar,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Users
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
import {
  useEmployeeSummary,
  useContacts,
  useCreateTransaction,
  useCashboxes,
  type EmployeeSummary,
} from '@/lib/db/queries';
import { toast } from 'sonner';
import { cn, formatMoney } from '@/lib/utils';
import Link from 'next/link';
export default function EmployeesPage() {
  const { data: employees = [], isLoading: summaryLoading } = useEmployeeSummary();
  const { data: contacts = [] } = useContacts('EMPLOYEE');
  const { data: cashboxes = [] } = useCashboxes();
  const createTransaction = useCreateTransaction();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Combine summary data with full contact details
  const enrichedEmployees = useMemo(() => {
    return employees.map(emp => {
      const contact = contacts.find(c => c.id === emp.id);
      return {
        ...emp,
        name: contact?.name ?? emp.name,
        phone: contact?.phone ?? emp.phone,
        job_title: contact?.job_title ?? emp.job_title,
        department: contact?.department ?? emp.department,
        salary: contact?.salary ?? emp.salary,
      };
    });
  }, [employees, contacts]);

  const filteredEmployees = useMemo(() => {
    return enrichedEmployees.filter((e) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.name?.toLowerCase().includes(q) ||
        e.job_title?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q) ||
        e.phone?.toLowerCase().includes(q)
      );
    });
  }, [enrichedEmployees, searchQuery]);

  const stats = useMemo(() => {
    const total = employees.length;
    const totalSalary = employees.reduce((sum, e) => sum + (Number(e.salary) || 0), 0);
    const totalPaid = employees.reduce((sum, e) => sum + Number(e.last_12_months_salary_paid), 0);
    const avgMonths = employees.length > 0 
      ? employees.reduce((sum, e) => sum + e.months_with_payment, 0) / employees.length 
      : 0;
    
    return { total, totalSalary, totalPaid, avgMonths };
  }, [employees]);

  async function handleRecordSalary() {
    if (!selectedEmployee || !paymentAmount) return;

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('أدخل مبلغاً أكبر من صفر');
      return;
    }

    const defaultCashbox = cashboxes[0]?.id;
    if (!defaultCashbox) {
      toast.error('لا توجد خزينة متاحة');
      return;
    }

    try {
      const supabase = (await import('@/lib/supabase/client')).createSupabaseBrowserClient();
      const { data: expenseCat, error: catErr } = await supabase
        .from('categories')
        .select('id')
        .eq('code', 'EXP-SLR')
        .maybeSingle();

      if (catErr) throw catErr;
      if (!expenseCat) {
        toast.error('فئة المصروفات "المرتبات" غير موجودة');
        return;
      }

      await createTransaction.mutateAsync({
        kind: 'EXPENSE',
        amount,
        method: 'CASH',
        category_id: expenseCat.id,
        cashbox_id: defaultCashbox,
        tx_date: new Date().toISOString().slice(0, 10),
        description: `راتب ${selectedEmployee.name}`,
        contact_id: selectedEmployee.id,
        contact_type: 'BENEFICIARY',
      });

      toast.success('تم تسجيل الراتب بنجاح');
      setSelectedEmployee(null);
      setPaymentAmount('');
    } catch {
      toast.error('فشل تسجيل الراتب');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="إدارة الموظفين"
        title="الموظفين والرواتب"
        description="متابعة الرواتب وتسجيل المدفوعات"
        actions={
          <Button size="sm" asChild>
            <Link href="/contacts">
              <Plus className="h-4 w-4 mr-1" />
              إضافة موظف
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4 bg-gradient-to-br from-purple-50 to-white border-purple-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">عدد الموظفين</p>
                <p className="text-2xl font-bold text-purple-700">{stats.total}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-white border-blue-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">إجمالي الرواتب</p>
                <p className="text-lg font-bold text-blue-700">{formatMoney(stats.totalSalary, 'LYD')}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-green-50 to-white border-green-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">المدفوع (12 شهر)</p>
                <p className="text-lg font-bold text-green-700">{formatMoney(stats.totalPaid, 'LYD')}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-sage-50 to-white border-sage-200">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-sage-100 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-sage-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">متوسط شهور الدفع</p>
                <p className="text-2xl font-bold text-sage-700">{stats.avgMonths.toFixed(1)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <Input
            placeholder="البحث بالاسم، المسمى الوظيفي، القسم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>

        {/* Employees Grid */}
        {summaryLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <Card className="p-8 text-center">
            <Briefcase className="mx-auto h-8 w-8 text-ink-mute" />
            <p className="mt-2 text-ink-mute">لا يوجد موظفين</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEmployees.map((emp) => {
              const salary = Number(emp.salary) || 0;
              const paidLastYear = Number(emp.last_12_months_salary_paid) || 0;
              const monthsPaid = emp.months_with_payment || 0;
              const avgMonthlyPaid = monthsPaid > 0 ? paidLastYear / monthsPaid : 0;
              
              return (
                <Card key={emp.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-4">
                    {/* Employee info */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                        <Briefcase className="h-6 w-6 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{emp.name}</h3>
                        <p className="text-sm text-gray-500">
                          {emp.job_title || '—'}
                          {emp.department && ` · ${emp.department}`}
                        </p>
                      </div>
                    </div>
                    
                    {/* Salary details */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                        <span className="text-gray-600">الراتب الشهري</span>
                        <span className="font-medium">{salary > 0 ? formatMoney(salary, 'LYD') : '—'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-dashed border-gray-200">
                        <span className="text-gray-600">متوسط الدفع الفعلي</span>
                        <span className={cn("font-medium", avgMonthlyPaid > 0 ? 'text-green-600' : '')}>
                          {avgMonthlyPaid > 0 ? formatMoney(avgMonthlyPaid, 'LYD') : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">المدفوع (12 شهر)</span>
                        <span className="font-medium text-sage-600">
                          {formatMoney(paidLastYear, 'LYD')}
                        </span>
                      </div>
                      {emp.phone && (
                        <div className="flex items-center gap-2 py-1 text-gray-500">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{emp.phone}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t flex gap-2">
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setSelectedEmployee(emp)}
                        disabled={salary === 0}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        تسجيل راتب
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        asChild
                        className="flex-1"
                      >
                        <Link href={`/contacts/${emp.id}`}>
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
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل راتب</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4 py-2">
              <div className="bg-purple-50 p-3 rounded-lg">
                <p className="font-medium">{selectedEmployee.name}</p>
                <p className="text-sm text-gray-600">
                  {selectedEmployee.job_title || '—'}
                  {selectedEmployee.department && ` · ${selectedEmployee.department}`}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">الراتب المحدد</p>
                  <p className="font-semibold">
                    {formatMoney(Number(selectedEmployee.salary) || 0, 'LYD')}
                  </p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-gray-600">آخر 12 شهر</p>
                  <p className="font-semibold">
                    {formatMoney(Number(selectedEmployee.last_12_months_salary_paid) || 0, 'LYD')}
                  </p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">المبلغ المدفوع</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={String(selectedEmployee.salary || 0)}
                  className="text-lg"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setSelectedEmployee(null)}
                >
                  إلغاء
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleRecordSalary}
                  disabled={!paymentAmount || createTransaction.isPending}
                >
                  {createTransaction.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'تسجيل الراتب'
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
