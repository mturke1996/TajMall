'use client';

import { Suspense, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, FileSpreadsheet, HandCoins, Scale, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmployees } from '@/lib/db/queries';
import {
  currentMonthKey,
  isPayrollSchemaMissing,
  payrollErrorMessage,
  structureForMonth,
  usePayrollRuns,
  usePayrollStructures,
} from '@/lib/db/payroll-queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { MonthSwitcher, PayrollLoadError, PayrollSchemaMissing } from '@/components/payroll/payroll-ui';
import { PayrollRunPanel } from '@/components/payroll/payroll-run-panel';
import { PayrollAdjustmentsPanel } from '@/components/payroll/payroll-adjustments-panel';
import { PayrollAdvancesPanel } from '@/components/payroll/payroll-advances-panel';
import { PayrollStructuresPanel } from '@/components/payroll/payroll-structures-panel';
import { Card } from '@/components/ui/card';

const TABS = ['run', 'adjustments', 'advances', 'structures'] as const;
type Tab = (typeof TABS)[number];

function PayrollScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'run';
  const monthParam = params.get('month');
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : currentMonthKey();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const { role, canWrite, loading: roleLoading } = usePermission();
  const canManage = role === 'owner' || role === 'admin' || role === 'accountant';
  const canApprove = role === 'owner' || role === 'admin';

  const { data: employees = [], isLoading: employeesLoading } = useEmployees();
  const { data: structures = [], isLoading: structuresLoading, error: structuresError } = usePayrollStructures();
  const { data: runs = [], isLoading: runsLoading, error: runsError } = usePayrollRuns();

  const run = runs.find((r) => r.period_month === month) ?? null;
  const monthLocked = run?.status === 'POSTED';
  const readyCount = useMemo(
    () => employees.filter((e) => structureForMonth(structures, e.id, month)).length,
    [employees, structures, month],
  );

  const missing = isPayrollSchemaMissing(structuresError) || isPayrollSchemaMissing(runsError);
  const loading = roleLoading || employeesLoading || structuresLoading || runsLoading;
  const otherError = !missing ? structuresError ?? runsError : null;

  return (
    <>
      <PageHeader
        eyebrow="الموظفون"
        title="الرواتب"
        description="كشف كل شهر من الإعداد حتى الصرف."
        actions={
          !missing && (
            <div className="flex flex-wrap items-center gap-2">
              {(tab === 'run' || tab === 'adjustments') && <MonthSwitcher month={month} onChange={(m) => setParam('month', m)} />}
              <Button variant="outline" size="sm" asChild>
                <Link href="/mall?tab=people&segment=EMPLOYEE">
                  <Briefcase />
                  الموظفون
                </Link>
              </Button>
            </div>
          )
        }
      />

      <div className="flex min-w-0 flex-col gap-5 px-4 py-5 sm:px-5 md:px-8 md:py-6">
        {!roleLoading && !canManage ? (
          // the database shows payroll lines to these roles only: an empty screen would look like "no payroll"
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-medium">الرواتب متاحة للمحاسب ومدير النظام والمالك</p>
            <p className="max-w-md text-[13px] text-ink-mute">
              اطلب من المدير تعديل دورك إن كان عملك يتطلب إعداد كشوف الرواتب أو صرفها.
            </p>
          </Card>
        ) : missing ? (
          <PayrollSchemaMissing />
        ) : loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full max-w-lg" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : otherError ? (
          <PayrollLoadError message={payrollErrorMessage(otherError)} />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setParam('tab', v)} dir="rtl" className="flex flex-col gap-5">
            <TabsList className="self-start overflow-x-auto no-scrollbar max-w-full">
              <TabsTrigger value="run">
                <FileSpreadsheet />
                كشف الشهر
              </TabsTrigger>
              <TabsTrigger value="adjustments">
                <Scale />
                المكافآت والخصومات
              </TabsTrigger>
              <TabsTrigger value="advances">
                <HandCoins />
                السلف
              </TabsTrigger>
              <TabsTrigger value="structures">
                <Wallet />
                هياكل الرواتب
              </TabsTrigger>
            </TabsList>

            <TabsContent value="run" className="mt-0">
              <PayrollRunPanel
                month={month}
                runs={runs}
                canManage={canManage}
                canApprove={canApprove}
                canPay={canWrite}
                employeeCount={readyCount}
                employeesWithoutStructure={employees.length - readyCount}
              />
            </TabsContent>
            <TabsContent value="adjustments" className="mt-0">
              <PayrollAdjustmentsPanel
                month={month}
                employees={employees}
                structures={structures}
                canManage={canManage}
                canApprove={canApprove}
                monthLocked={monthLocked}
              />
            </TabsContent>
            <TabsContent value="advances" className="mt-0">
              <PayrollAdvancesPanel employees={employees} canManage={canManage} canApprove={canApprove} />
            </TabsContent>
            <TabsContent value="structures" className="mt-0">
              <PayrollStructuresPanel employees={employees} structures={structures} canManage={canManage} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}

export default function PayrollPage() {
  return (
    <Suspense fallback={null}>
      <PayrollScreen />
    </Suspense>
  );
}
