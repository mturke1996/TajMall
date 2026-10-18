'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthSwitcher, PayrollSchemaMissing } from '@/components/payroll/payroll-ui';
import { PayrollRunPanel } from '@/components/payroll/payroll-run-panel';
import { PayrollAdjustmentsPanel } from '@/components/payroll/payroll-adjustments-panel';
import { PayrollAdvancesPanel } from '@/components/payroll/payroll-advances-panel';
import { PayrollStructuresPanel } from '@/components/payroll/payroll-structures-panel';
import { qk } from '@/lib/db/queries';
import { pqk, structureForMonth, type PayrollRun, type PayrollRunLine } from '@/lib/db/payroll-queries';
import type { ContactRow } from '@/lib/db/types';

const MONTH = '2026-10';
const PREV = '2026-09';

const EMPLOYEES = [
  ['أحمد سالم', 'مشرف أمن', 'الأمن'],
  ['خالد عمر', 'حارس', 'الأمن'],
  ['فاطمة علي', 'محاسبة', 'المالية'],
  ['محمد الطاهر', 'فني صيانة', 'الصيانة'],
  ['سارة يوسف', 'موظفة استقبال', 'الإدارة'],
  ['علي المبروك', 'عامل نظافة', 'الخدمات'],
].map(([name, job, dept], i) => ({
  id: `emp-${i}`,
  kind: 'EMPLOYEE',
  name,
  job_title: job,
  department: dept,
  is_active: true,
  hire_date: '2024-03-01',
})) as unknown as ContactRow[];

const STRUCTURES = [
  [1800, 300, 150],
  [1300, 0, 100],
  [2200, 400, 50],
  [1500, 200, 100],
  [1200, 0, 0],
].flatMap(([base, housing, transport], i) => {
  const rows = [
    {
      id: `ss-${i}`,
      employee_id: `emp-${i}`,
      effective_from: '2026-07-01',
      base_salary: String(base),
      housing_allowance: String(housing),
      transport_allowance: String(transport),
      other_allowance: '0',
      notes: i === 0 ? 'زيادة سنوية' : null,
      created_at: '2026-07-01',
    },
  ];
  if (i === 0)
    rows.push({ ...rows[0], id: 'ss-old', effective_from: '2025-01-01', base_salary: '1600', notes: null });
  return rows;
});

function line(i: number, month: string, status: PayrollRun['status'], extra: Partial<Record<string, number>> = {}): PayrollRunLine {
  const s = STRUCTURES.find((x) => x.employee_id === `emp-${i}` && x.effective_from === '2026-07-01')!;
  const v = {
    base_salary: Number(s.base_salary),
    allowances: Number(s.housing_allowance) + Number(s.transport_allowance),
    bonuses: 0,
    overtime: 0,
    absence_deduction: 0,
    penalties: 0,
    other_deductions: 0,
    advance_repayment: 0,
    paid: 0,
    ...extra,
  };
  const gross = v.base_salary + v.allowances + v.bonuses + v.overtime - v.absence_deduction;
  const net = gross - v.penalties - v.other_deductions - v.advance_repayment;
  const e = EMPLOYEES[i];
  return {
    id: `line-${month}-${i}`,
    run_id: `run-${month}`,
    employee_id: e.id,
    employee_name: e.name,
    job_title: e.job_title,
    department: e.department,
    period_month: month,
    run_status: status,
    ...Object.fromEntries(Object.entries(v).map(([k, n]) => [k, String(n)])),
    gross: String(gross),
    net: String(net),
    outstanding: String(net - v.paid),
  } as PayrollRunLine;
}

const RUNS: PayrollRun[] = [
  { id: `run-${MONTH}`, period_month: MONTH, status: 'POSTED', prepared_at: '2026-10-28', approved_at: '2026-10-29', posted_at: '2026-10-30', journal_entry_id: 'je-1', notes: null },
  { id: `run-${PREV}`, period_month: PREV, status: 'POSTED', prepared_at: '2026-09-28', approved_at: '2026-09-29', posted_at: '2026-09-30', journal_entry_id: 'je-0', notes: null },
];

const LINES = [
  line(0, MONTH, 'POSTED', { bonuses: 250, advance_repayment: 200, paid: 2300 }),
  line(1, MONTH, 'POSTED', { absence_deduction: 86.667, penalties: 50 }),
  line(2, MONTH, 'POSTED', { overtime: 120.5, paid: 2770.5 }),
  line(3, MONTH, 'POSTED', {}),
  line(4, MONTH, 'POSTED', { paid: 600 }),
];
const PREV_LINES = [0, 1, 2, 3, 4].map((i) => line(i, PREV, 'POSTED', i === 0 ? { advance_repayment: 200 } : {}));

const ADJUSTMENTS = [
  { id: 'adj-1', employee_id: 'emp-0', period_month: MONTH, kind: 'BONUS', amount: '250', days: null, reason: 'إدارة فعالية نهاية الأسبوع', status: 'APPROVED', decided_at: '2026-10-20', decision_note: null, run_id: `run-${MONTH}`, created_at: '2026-10-18' },
  { id: 'adj-2', employee_id: 'emp-1', period_month: MONTH, kind: 'ABSENCE', amount: '86.667', days: '2', reason: 'غياب بدون إذن يومي 12 و13', status: 'APPROVED', decided_at: '2026-10-20', decision_note: null, run_id: `run-${MONTH}`, created_at: '2026-10-14' },
  { id: 'adj-3', employee_id: 'emp-1', period_month: MONTH, kind: 'PENALTY', amount: '50', days: null, reason: 'تأخر متكرر عن الوردية', status: 'APPROVED', decided_at: '2026-10-20', decision_note: null, run_id: `run-${MONTH}`, created_at: '2026-10-15' },
  { id: 'adj-4', employee_id: 'emp-2', period_month: MONTH, kind: 'OVERTIME', amount: '120.5', days: null, reason: 'إقفال حسابات الربع الثالث', status: 'APPROVED', decided_at: '2026-10-21', decision_note: null, run_id: `run-${MONTH}`, created_at: '2026-10-19' },
  { id: 'adj-5', employee_id: 'emp-3', period_month: MONTH, kind: 'BONUS', amount: '100', days: null, reason: 'إصلاح طارئ لمضخة المياه', status: 'CANCELLED', decided_at: '2026-10-21', decision_note: 'يُصرف ضمن عقد الصيانة', run_id: null, created_at: '2026-10-19' },
];

const ADVANCES = [
  { id: 'adv-1', employee_id: 'emp-0', employee_name: 'أحمد سالم', issued_on: '2026-08-05', amount: '1000', installments: 5, installment_amount: '200', reason: 'ظرف عائلي', cashbox_id: 'cb-1', status: 'OPEN', cancel_reason: null, repaid: '600', remaining: '400', created_at: '2026-08-05' },
  { id: 'adv-2', employee_id: 'emp-4', employee_name: 'سارة يوسف', issued_on: '2026-10-25', amount: '600', installments: 3, installment_amount: '200', reason: 'رسوم دراسية', cashbox_id: 'cb-1', status: 'OPEN', cancel_reason: null, repaid: '0', remaining: '600', created_at: '2026-10-25' },
  { id: 'adv-3', employee_id: 'emp-3', employee_name: 'محمد الطاهر', issued_on: '2026-03-01', amount: '400', installments: 2, installment_amount: '200', reason: 'سلفة علاج', cashbox_id: 'cb-1', status: 'SETTLED', cancel_reason: null, repaid: '400', remaining: '0', created_at: '2026-03-01' },
];

const CASHBOXES = [
  { id: 'cb-1', code: 'CASH', name: 'Cash', name_ar: 'الخزينة النقدية', kind: 'CASH', active: true },
  { id: 'cb-2', code: 'BANK1', name: 'Bank', name_ar: 'مصرف الواحة', kind: 'BANK', active: true },
];

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(qk.employees, EMPLOYEES);
  client.setQueryData(qk.cashboxes, CASHBOXES);
  client.setQueryData(pqk.structures, STRUCTURES);
  client.setQueryData(pqk.runs, RUNS);
  client.setQueryData(pqk.runLines(`run-${MONTH}`), LINES);
  client.setQueryData(pqk.runLines(`run-${PREV}`), PREV_LINES);
  client.setQueryData(pqk.adjustments(MONTH), ADJUSTMENTS);
  client.setQueryData(pqk.advances, ADVANCES);
  return client;
}

export function PayrollPreview({ initialTab = 'run' }: { initialTab?: string }) {
  const [client] = useState(seededClient);
  const [tab, setTab] = useState(initialTab);
  const ready = EMPLOYEES.filter((e) => structureForMonth(STRUCTURES, e.id, MONTH)).length;

  return (
    <QueryClientProvider client={client}>
      <div className="flex min-h-dvh bg-background" dir="rtl">
        <Sidebar previewAllItems />
        <main className="min-w-0 flex-1">
          <PageHeader
            eyebrow="الموظفون"
            title="الرواتب"
            description="هياكل الرواتب، المكافآت والخصومات، السلف، وكشف كل شهر من الإعداد حتى الصرف."
            actions={<MonthSwitcher month={MONTH} onChange={() => {}} />}
          />
          <div className="flex min-w-0 flex-col gap-5 px-4 py-5 sm:px-5 md:px-8 md:py-6">
            <Tabs value={tab} onValueChange={setTab} dir="rtl" className="flex flex-col gap-5">
              <TabsList className="self-start overflow-x-auto no-scrollbar max-w-full">
                <TabsTrigger value="run">كشف الشهر</TabsTrigger>
                <TabsTrigger value="adjustments">المكافآت والخصومات</TabsTrigger>
                <TabsTrigger value="advances">السلف</TabsTrigger>
                <TabsTrigger value="structures">هياكل الرواتب</TabsTrigger>
                <TabsTrigger value="missing">قبل التفعيل</TabsTrigger>
              </TabsList>
              <TabsContent value="run" className="mt-0">
                <PayrollRunPanel
                  month={MONTH}
                  runs={RUNS}
                  canManage
                  canApprove
                  canPay
                  employeeCount={ready}
                  employeesWithoutStructure={EMPLOYEES.length - ready}
                />
              </TabsContent>
              <TabsContent value="adjustments" className="mt-0">
                <PayrollAdjustmentsPanel month={MONTH} employees={EMPLOYEES} structures={STRUCTURES} canManage canApprove monthLocked={false} />
              </TabsContent>
              <TabsContent value="advances" className="mt-0">
                <PayrollAdvancesPanel employees={EMPLOYEES} canManage canApprove />
              </TabsContent>
              <TabsContent value="structures" className="mt-0">
                <PayrollStructuresPanel employees={EMPLOYEES} structures={STRUCTURES} canManage />
              </TabsContent>
              <TabsContent value="missing" className="mt-0">
                <PayrollSchemaMissing />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}
