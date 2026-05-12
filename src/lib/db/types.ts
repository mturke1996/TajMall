/**
 * Database row types — mirror the schema in supabase/migrations/001_init.sql.
 * Keep these in sync with the SQL definitions.
 */

export type TxKind = 'REVENUE' | 'EXPENSE' | 'TRANSFER' | 'OPENING' | 'ADJUSTMENT';
export type TxStatus = 'DRAFT' | 'POSTED' | 'VOIDED' | 'RECONCILED';
export type PaymentMethod = 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';
export type CashboxKind = 'CASH' | 'BANK' | 'CARD' | 'OTHER';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type ProfileRow = {
  id: string;
  full_name: string | null;
  full_name_ar: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type BranchRow = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  address: string | null;
  phone: string | null;
  is_hq: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  code: string;
  name: string;
  name_ar: string;
  kind: 'REVENUE' | 'EXPENSE';
  type: AccountType;
  color: string | null;
  icon: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CashboxRow = {
  id: string;
  code: string;
  name: string;
  name_ar: string;
  kind: CashboxKind;
  currency: string;
  bank_name: string | null;
  account_number: string | null;
  iban: string | null;
  opening_balance: string; // numeric → returned as string by postgrest
  color: string | null;
  branch_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CashboxBalanceRow = {
  id: string;
  code: string;
  name_ar: string;
  kind: CashboxKind;
  bank_name: string | null;
  color: string | null;
  currency: string;
  opening_balance: string;
  balance: string;
  tx_count_month: number;
  month_inflow: string;
  month_outflow: string;
};

export type TransactionRow = {
  id: string;
  number: number;
  reference: string | null;
  kind: TxKind;
  status: TxStatus;
  method: PaymentMethod;
  amount: string;
  currency: string;
  tx_date: string;
  description: string | null;
  notes: string | null;
  cheque_number: string | null;
  cheque_bank: string | null;
  cheque_date: string | null;
  category_id: string | null;
  cashbox_id: string | null;
  branch_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Transaction joined with its category and cashbox — what tables/lists need. */
export type TransactionWithRelations = TransactionRow & {
  category: Pick<CategoryRow, 'id' | 'code' | 'name_ar' | 'kind' | 'color'> | null;
  cashbox: Pick<CashboxRow, 'id' | 'code' | 'name_ar' | 'kind'> | null;
};

export type NewTransactionInput = {
  kind: TxKind;
  amount: number;
  method: PaymentMethod;
  category_id: string;
  cashbox_id: string;
  tx_date: string; // YYYY-MM-DD
  description?: string;
  reference?: string;
  notes?: string;
  branch_id?: string;
};
