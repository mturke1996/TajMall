import type { QueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { qk } from '@/lib/db/queries';
import { mqk } from '@/lib/db/mall-queries';
import { qk as jqk, type JournalEntryRow } from '@/lib/db/journal-queries';
import type { ContactKind } from '@/lib/db/types';

const TX_SELECT =
  '*, category:categories(id,code,name_ar,kind,color), cashbox:cashboxes(id,code,name_ar,kind), creator:profiles(id,full_name_ar,full_name), contact:contacts(id,name,kind,shop_number)';

const JOURNAL_LIST_KEY = {
  status: null,
  contactId: null,
  cashboxId: null,
  search: null,
  limit: 100,
} as const;

async function fetchCategories() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchCashboxes() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('cashboxes')
    .select('*')
    .eq('active', true)
    .order('code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchCashboxBalances() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('cashbox_balances')
    .select('*')
    .order('code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchContacts(kind?: ContactKind) {
  const supabase = createSupabaseBrowserClient();
  let q = supabase
    .from('contacts')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function fetchBranches() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('active', true)
    .order('code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchProfiles() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchTransactions(kind?: 'REVENUE' | 'EXPENSE', limit = 500) {
  const supabase = createSupabaseBrowserClient();
  let q = supabase
    .from('transactions')
    .select(TX_SELECT)
    .order('created_at', { ascending: false })
    .order('number', { ascending: false })
    .limit(limit);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function fetchRecentTransactions(limit = 8) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('transactions')
    .select(TX_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

async function fetchDashboardStats() {
  const supabase = createSupabaseBrowserClient();
  const year = new Date().getFullYear();
  const { data, error } = await supabase
    .from('transactions')
    .select('amount, kind, tx_date, category:categories(name_ar, color)')
    .eq('status', 'POSTED')
    .gte('tx_date', `${year}-01-01`)
    .lt('tx_date', `${year + 1}-01-01`);
  if (error) throw error;

  const { data: balances } = await supabase.from('cashbox_balances').select('balance');

  const rows = (data ?? []) as unknown as Array<{
    amount: string;
    kind: string;
    tx_date: string;
    category: { name_ar: string; color: string | null } | null;
  }>;

  let totalRevenue = 0;
  let totalExpense = 0;
  const monthlyR = Array(12).fill(0);
  const monthlyE = Array(12).fill(0);
  const expenseByCat = new Map<string, { value: number; color: string }>();

  for (const r of rows) {
    const n = Number(r.amount);
    const m = new Date(r.tx_date).getMonth();
    if (r.kind === 'REVENUE') {
      totalRevenue += n;
      monthlyR[m] += n;
    } else if (r.kind === 'EXPENSE') {
      totalExpense += n;
      monthlyE[m] += n;
      const label = r.category?.name_ar ?? 'بدون بند';
      const color = r.category?.color ?? '#6E7470';
      const prev = expenseByCat.get(label);
      expenseByCat.set(label, {
        value: (prev?.value ?? 0) + n,
        color,
      });
    }
  }

  const totalCashboxBalance = (balances ?? []).reduce(
    (s: number, b: { balance: string }) => s + Number(b.balance),
    0,
  );

  const topExpenseCategories = Array.from(expenseByCat.entries())
    .map(([label, { value, color }]) => ({ label, value, color }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const monthlySeries = AR_MONTHS.map((month, i) => ({
    month,
    revenue: monthlyR[i],
    expense: monthlyE[i],
  }));

  return {
    totalRevenue,
    totalExpense,
    netProfit: totalRevenue - totalExpense,
    totalCashboxBalance,
    monthlySeries,
    topExpenseCategories,
  };
}

async function fetchMonthlySummary() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('monthly_summary')
    .select('*')
    .order('month', { ascending: false })
    .limit(12);
  if (error) throw error;
  return data ?? [];
}

async function fetchTopExpenseCategories() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from('top_expense_categories').select('*').limit(10);
  if (error) throw error;
  return data ?? [];
}

async function fetchTenantRentSummary() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('tenant_rent_summary')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchEmployeeSummary() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('employee_summary')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchDisbursementVouchers() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('disbursement_vouchers')
    .select(`*, disbursement_voucher_lines (*)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchFiscalPeriods() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchMallUnits() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('mall_units')
    .select('*')
    .order('unit_number', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchLeaseContracts() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('lease_contracts')
    .select(`*, unit:mall_units(id, unit_number, floor, area_sqm), tenant:contacts(id, name, phone)`)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchTenantCharges() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('tenant_charges')
    .select(`*, contract:lease_contracts(id, tenant:contacts(name))`)
    .order('due_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchJournalEntries() {
  const supabase = createSupabaseBrowserClient();
  const limit = JOURNAL_LIST_KEY.limit;

  const { data, error } = await supabase.rpc('get_journal_entries_filtered', {
    p_status: null,
    p_contact_id: null,
    p_cashbox_id: null,
    p_search: null,
    p_limit: limit,
  });

  if (!error) return (data as JournalEntryRow[]) ?? [];

  const msg = error.message ?? '';
  const rpcMissing =
    msg.includes('get_journal_entries_filtered') ||
    msg.includes('schema cache') ||
    error.code === 'PGRST202';

  if (!rpcMissing) throw error;

  const { data: rows, error: viewError } = await supabase
    .from('journal_entries_with_totals')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('number', { ascending: false })
    .limit(limit);

  if (viewError) throw viewError;
  return (rows as JournalEntryRow[]) ?? [];
}

async function fetchJournalSummary() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from('journal_summary').select('*').single();
  if (error) throw error;
  return data;
}

async function fetchTrialBalance(year: number) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_trial_balance', { p_year: year });
  if (error) throw error;
  return data;
}

async function fetchProfitLoss(year: number) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_profit_loss', {
    p_year: year,
    p_period: 'year',
    p_quarter: null,
    p_month: null,
  });
  if (error) throw error;
  return data;
}

async function fetchCashFlow(year: number) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('get_cash_flow', { p_year: year });
  if (error) throw error;
  return data;
}

/** يملأ ذاكرة TanStack Query بكل البيانات الحرجة — يُستدعى عند فتح التطبيق */
export async function prefetchAppData(queryClient: QueryClient): Promise<void> {
  const year = new Date().getFullYear();
  const contactKinds: (ContactKind | undefined)[] = [
    undefined,
    'TENANT',
    'EMPLOYEE',
    'VENDOR',
  ];

  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery({ queryKey: qk.categories, queryFn: fetchCategories }),
    queryClient.prefetchQuery({ queryKey: qk.cashboxes, queryFn: fetchCashboxes }),
    queryClient.prefetchQuery({ queryKey: qk.cashboxBalances, queryFn: fetchCashboxBalances }),
    queryClient.prefetchQuery({ queryKey: qk.branches, queryFn: fetchBranches }),
    queryClient.prefetchQuery({ queryKey: qk.profiles, queryFn: fetchProfiles }),
    queryClient.prefetchQuery({ queryKey: qk.transactions(), queryFn: () => fetchTransactions() }),
    queryClient.prefetchQuery({
      queryKey: qk.transactions('REVENUE'),
      queryFn: () => fetchTransactions('REVENUE'),
    }),
    queryClient.prefetchQuery({
      queryKey: qk.transactions('EXPENSE'),
      queryFn: () => fetchTransactions('EXPENSE'),
    }),
    queryClient.prefetchQuery({
      queryKey: [...qk.recentTransactions, 6],
      queryFn: () => fetchRecentTransactions(6),
    }),
    queryClient.prefetchQuery({
      queryKey: [...qk.recentTransactions, 8],
      queryFn: () => fetchRecentTransactions(8),
    }),
    queryClient.prefetchQuery({ queryKey: qk.dashboardStats, queryFn: fetchDashboardStats }),
    queryClient.prefetchQuery({ queryKey: qk.monthlySummary, queryFn: fetchMonthlySummary }),
    queryClient.prefetchQuery({
      queryKey: qk.topExpenseCategories,
      queryFn: fetchTopExpenseCategories,
    }),
    queryClient.prefetchQuery({
      queryKey: qk.tenantRentSummary,
      queryFn: fetchTenantRentSummary,
    }),
    queryClient.prefetchQuery({
      queryKey: qk.employeeSummary,
      queryFn: fetchEmployeeSummary,
    }),
    queryClient.prefetchQuery({
      queryKey: qk.disbursementVouchers,
      queryFn: fetchDisbursementVouchers,
    }),
    queryClient.prefetchQuery({ queryKey: mqk.fiscalPeriods, queryFn: fetchFiscalPeriods }),
    queryClient.prefetchQuery({ queryKey: mqk.mallUnits, queryFn: fetchMallUnits }),
    queryClient.prefetchQuery({ queryKey: mqk.leaseContracts, queryFn: fetchLeaseContracts }),
    queryClient.prefetchQuery({
      queryKey: mqk.tenantCharges(),
      queryFn: fetchTenantCharges,
    }),
    queryClient.prefetchQuery({
      queryKey: [...jqk.journalEntries, JOURNAL_LIST_KEY],
      queryFn: fetchJournalEntries,
    }),
    queryClient.prefetchQuery({ queryKey: jqk.journalSummary, queryFn: fetchJournalSummary }),
    queryClient.prefetchQuery({
      queryKey: mqk.trialBalance(year),
      queryFn: () => fetchTrialBalance(year),
    }),
    queryClient.prefetchQuery({
      queryKey: mqk.profitLoss(year, 'year', null, null),
      queryFn: () => fetchProfitLoss(year),
    }),
    queryClient.prefetchQuery({
      queryKey: mqk.cashFlow(year),
      queryFn: () => fetchCashFlow(year),
    }),
  ];

  for (const kind of contactKinds) {
    tasks.push(
      queryClient.prefetchQuery({
        queryKey: qk.contacts(kind),
        queryFn: () => fetchContacts(kind),
      }),
    );
  }

  await Promise.allSettled(tasks);
}

export const APP_DATA_WARM_KEY = 'fluxen:data-warm-v1';
