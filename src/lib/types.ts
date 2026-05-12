/**
 * Shared TypeScript types for the UI layer.
 * These mirror the Prisma models but stay JSON-safe (Decimal → number).
 */

export type TxKind = 'REVENUE' | 'EXPENSE' | 'TRANSFER' | 'OPENING' | 'ADJUSTMENT';
export type TxStatus = 'DRAFT' | 'POSTED' | 'VOIDED' | 'RECONCILED';
export type PaymentMethod = 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';
export type CashboxKind = 'CASH' | 'BANK' | 'CARD' | 'OTHER';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type TransactionRow = {
  id: string;
  number: number;
  reference: string | null;
  txDate: string;
  description: string | null;
  amount: number;
  method: PaymentMethod;
  kind: TxKind;
  status: TxStatus;
  category: { id: string; nameAr: string; color: string | null };
  cashbox: { id: string; nameAr: string; kind: CashboxKind };
  hasAttachment?: boolean;
};

export type CashboxBalance = {
  id: string;
  code: string;
  nameAr: string;
  kind: CashboxKind;
  bankName: string | null;
  color: string | null;
  balance: number;
  monthInflow: number;
  monthOutflow: number;
  series: number[];
};

export type CategoryRow = {
  id: string;
  code: string;
  nameAr: string;
  name: string;
  kind: 'REVENUE' | 'EXPENSE';
  type: AccountType;
  color: string;
  active: boolean;
  totalAmount?: number;
  txCount?: number;
};

export type DashboardSummary = {
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
  totalCashboxBalance: number;
  deltas: { revenue: number; expense: number; profit: number; cashbox: number };
  monthlySeries: { month: string; revenue: number; expense: number }[];
  topExpenseCategories: { label: string; value: number; color: string }[];
  cashboxes: CashboxBalance[];
  recentTransactions: TransactionRow[];
};
