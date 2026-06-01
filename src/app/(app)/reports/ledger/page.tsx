'use client';

import { useState, useMemo } from 'react';
import {
  BookMarked,
  Search,
  Loader2,
  Calendar,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import { useCategories } from '@/lib/db/queries';
import { useGeneralLedger, useBackfillTransactions } from '@/lib/db/mall-queries';

export default function GeneralLedgerPage() {
  const { data: categories = [], isLoading: isLoadingCats } = useCategories();
  const backfillTx = useBackfillTransactions();
  
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const { data: ledgerLines = [], isLoading: isLoadingLedger, isError, error } = useGeneralLedger(
    selectedCatId,
    startDate || undefined,
    endDate || undefined
  );

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCatId);
  }, [categories, selectedCatId]);

  // Compute totals and running balances
  const { linesWithBalance, totalDebit, totalCredit, netBalance } = useMemo(() => {
    let currentBalance = 0;
    let deb = 0;
    let cred = 0;

    const lines = ledgerLines.map((line) => {
      const lineDebit = Number(line.debit || 0);
      const lineCredit = Number(line.credit || 0);
      
      deb += lineDebit;
      cred += lineCredit;

      // Adjust running balance based on category type (Asset/Expense increase on debit, others on credit)
      const isDebitIncrease = selectedCategory?.type === 'ASSET' || selectedCategory?.type === 'EXPENSE';
      if (isDebitIncrease) {
        currentBalance += (lineDebit - lineCredit);
      } else {
        currentBalance += (lineCredit - lineDebit);
      }

      return {
        ...line,
        runningBalance: currentBalance,
      };
    });

    return {
      linesWithBalance: lines,
      totalDebit: deb,
      totalCredit: cred,
      netBalance: currentBalance,
    };
  }, [ledgerLines, selectedCategory]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="دفتر الأستاذ العام"
        description="كشف حساب تفصيلي للبنود المحاسبية يظهر الحركات الدائنة والمدينة والرصيد التراكمي"
      />

      {/* Filters Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label>الحساب / البند المحاسبي</Label>
              <Select value={selectedCatId} onValueChange={setSelectedCatId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isLoadingCats ? 'جاري التحميل...' : 'اختر بنداً محاسبياً'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name_ar} ({cat.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>تاريخ البدء</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-10"
                />
                <Calendar className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>تاريخ الانتهاء</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-10"
                />
                <Calendar className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSelectedCatId('');
                }}
              >
                تصفية الفلاتر
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {selectedCategory && !isLoadingLedger && !isError && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-slate-50/50">
            <CardHeader className="py-4">
              <span className="text-xs text-slate-500 font-medium">إجمالي الحركات المدينة (Debit)</span>
              <CardTitle className="text-2xl font-mono font-bold text-slate-900 mt-1">
                {formatMoney(totalDebit, 'LYD')}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="bg-slate-50/50">
            <CardHeader className="py-4">
              <span className="text-xs text-slate-500 font-medium">إجمالي الحركات الدائنة (Credit)</span>
              <CardTitle className="text-2xl font-mono font-bold text-slate-900 mt-1">
                {formatMoney(totalCredit, 'LYD')}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-emerald-100 bg-emerald-50/40">
            <CardHeader className="py-4">
              <span className="text-xs text-emerald-800 font-medium">الرصيد الختامي للأستاذ</span>
              <CardTitle className="text-2xl font-mono font-bold text-emerald-950 mt-1">
                {formatMoney(netBalance, 'LYD')}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Ledger Lines Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">حركات دفتر الأستاذ</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedCatId ? (
            <div className="flex h-48 flex-col items-center justify-center text-slate-400">
              <BookMarked className="h-12 w-12 mb-2 opacity-50 text-slate-400" />
              <p className="font-medium text-slate-600">الرجاء اختيار بند محاسبي لعرض كشف الحساب</p>
              <p className="text-xs text-slate-400 mt-1">يمكنك استخدام الفلاتر بالأعلى للتحكم بنطاق التواريخ</p>
            </div>
          ) : isLoadingLedger ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-red-600 bg-red-50 rounded-lg p-4">
              <AlertTriangle className="h-8 w-8" />
              <p className="font-semibold">فشل تحميل دفتر الأستاذ</p>
              <p className="text-sm text-red-500">{(error as any)?.message}</p>
            </div>
          ) : linesWithBalance.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-slate-400">
              <Search className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-center font-medium">لا توجد قيود مرحلة لهذا الحساب خلال الفترة المحددة</p>
              <p className="text-xs text-slate-400 text-center mt-1">تأكد من ترحيل المعاملات أو انقر على الزر أدناه لتشغيل الترحيل التراكمي للبيانات القديمة.</p>
              <Button
                onClick={() => backfillTx.mutate()}
                disabled={backfillTx.isPending}
                className="mt-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold gap-2"
              >
                {backfillTx.isPending ? 'جاري الترحيل...' : 'تشغيل الترحيل التراكمي للدفتر'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-100 pb-3 text-slate-500 font-medium">
                    <th className="pb-3 pr-2 text-right">التاريخ</th>
                    <th className="pb-3 text-right">رقم القيد</th>
                    <th className="pb-3 text-right">المرجع</th>
                    <th className="pb-3 text-right">البيان / الوصف</th>
                    <th className="pb-3 text-left">مدين (Debit)</th>
                    <th className="pb-3 text-left">دائن (Credit)</th>
                    <th className="pb-3 pl-2 text-left">الرصيد التراكمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linesWithBalance.map((line, idx) => {
                    const debVal = Number(line.debit || 0);
                    const credVal = Number(line.credit || 0);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3 pr-2 text-slate-600 font-mono">
                          {line.journal?.entry_date ? formatDate(line.journal.entry_date) : '-'}
                        </td>
                        <td className="py-3 text-slate-900 font-mono font-medium">
                          #{line.journal?.number || '-'}
                        </td>
                        <td className="py-3 text-slate-500 font-mono text-xs">
                          {line.journal?.reference || '-'}
                        </td>
                        <td className="py-3 text-slate-700 max-w-xs truncate" title={line.description || ''}>
                          {line.description || '-'}
                        </td>
                        <td className={cn(
                          "py-3 text-left font-mono font-medium",
                          debVal > 0 ? "text-emerald-700" : "text-slate-300"
                        )}>
                          {debVal > 0 ? `+${formatMoney(debVal, '')}` : '-'}
                        </td>
                        <td className={cn(
                          "py-3 text-left font-mono font-medium",
                          credVal > 0 ? "text-red-600" : "text-slate-300"
                        )}>
                          {credVal > 0 ? `-${formatMoney(credVal, '')}` : '-'}
                        </td>
                        <td className="py-3 pl-2 text-left font-mono font-bold text-slate-800">
                          {formatMoney(line.runningBalance, 'LYD')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
