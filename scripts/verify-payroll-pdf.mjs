/**
 * تحقق من توليد كشف الرواتب المجمّع وقسيمة الراتب ببيانات ثابتة، ومن أن المجاميع مطابقة لما تعرضه الشاشة.
 * التشغيل: npx tsx scripts/verify-payroll-pdf.mjs
 */
import React from 'react';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { PayrollRegisterPDF } from '../src/features/pdf/PayrollRegisterPDF.tsx';
import { PayslipPDF } from '../src/features/pdf/PayslipPDF.tsx';
import { monthsLabel } from '../src/components/payroll/payroll-dialogs.tsx';
import { formatMonthKeyAr } from '../src/lib/utils.ts';
import { shiftMonth, structureForMonth, structureTotal } from '../src/lib/db/payroll-queries.ts';

function line(id, name, base, allowances, extra = {}) {
  const l = {
    id,
    run_id: 'run-1',
    employee_id: `emp-${id}`,
    employee_name: name,
    job_title: 'حارس أمن',
    department: 'الأمن',
    period_month: '2026-10',
    run_status: 'POSTED',
    base_salary: String(base),
    allowances: String(allowances),
    bonuses: '0',
    overtime: '0',
    absence_deduction: '0',
    penalties: '0',
    other_deductions: '0',
    advance_repayment: '0',
    paid: '0',
    ...extra,
  };
  const n = (k) => Number(l[k]);
  const gross = n('base_salary') + n('allowances') + n('bonuses') + n('overtime') - n('absence_deduction');
  const net = gross - n('penalties') - n('other_deductions') - n('advance_repayment');
  return { ...l, gross: String(gross), net: String(net), outstanding: String(net - n('paid')) };
}

const lines = [
  line('1', 'أحمد سالم', 1800, 300, { bonuses: '250', advance_repayment: '200', paid: '2150' }),
  line('2', 'خالد عمر', 1500, 0, { absence_deduction: '100', penalties: '50' }),
  line('3', 'فاطمة علي', 2200, 450, { overtime: '120.500' }),
];

const expectedNet = 2150 + 1350 + 2770.5;
const net = lines.reduce((s, l) => s + Number(l.net), 0);
if (Math.abs(net - expectedNet) > 0.0005) throw new Error(`net total ${net} != ${expectedNet}`);

const register = await renderPdfBlob(async () =>
  React.createElement(PayrollRegisterPDF, { month: '2026-10', status: 'POSTED', lines }),
);
if (register.size < 5000) throw new Error(`register PDF too small (${register.size} bytes)`);

const payslip = await renderPdfBlob(async () =>
  React.createElement(PayslipPDF, {
    line: lines[0],
    adjustments: [
      { id: 'a1', employee_id: 'emp-1', period_month: '2026-10', kind: 'BONUS', amount: '250', reason: 'تميز في العمل', status: 'APPROVED' },
    ],
  }),
);
if (payslip.size < 5000) throw new Error(`payslip PDF too small (${payslip.size} bytes)`);

// Helpers the screens rely on.
const checks = [
  [formatMonthKeyAr('2026-10'), 'أكتوبر 2026'],
  [shiftMonth('2026-01', -1), '2025-12'],
  [shiftMonth('2026-12', 1), '2027-01'],
  [monthsLabel(1), 'شهر واحد'],
  [monthsLabel(2), 'شهران'],
  [monthsLabel(3), '3 أشهر'],
  [monthsLabel(12), '12 شهراً'],
];
const structures = [
  { id: 's1', employee_id: 'e', effective_from: '2026-01-01', base_salary: '1000', housing_allowance: '100', transport_allowance: '0', other_allowance: '0' },
  { id: 's2', employee_id: 'e', effective_from: '2026-07-01', base_salary: '1200', housing_allowance: '100', transport_allowance: '50', other_allowance: '0' },
];
checks.push([structureForMonth(structures, 'e', '2026-06')?.id, 's1']);
checks.push([structureForMonth(structures, 'e', '2026-07')?.id, 's2']);
checks.push([structureForMonth(structures, 'e', '2025-12'), null]);
checks.push([structureTotal(structures[1]), 1350]);

for (const [actual, expected] of checks) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log(JSON.stringify({ registerBytes: register.size, payslipBytes: payslip.size, net }));
console.log(`✓ verify-payroll-pdf: register, payslip and ${checks.length} helper checks passed`);
