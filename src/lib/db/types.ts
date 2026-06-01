/**
 * Database row types — mirror the schema in `supabase/migrations/` (مثل 001_init و009 إذونات الصرف).
 * Keep these in sync with the SQL definitions.
 */

export type TxKind = 'REVENUE' | 'EXPENSE' | 'TRANSFER' | 'OPENING' | 'ADJUSTMENT';
export type TxStatus = 'DRAFT' | 'POSTED' | 'VOIDED' | 'RECONCILED';
export type PaymentMethod = 'CASH' | 'CHEQUE' | 'TRANSFER' | 'CARD';
export type CashboxKind = 'CASH' | 'BANK' | 'CARD' | 'OTHER';
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type ContactKind = 'CUSTOMER' | 'TENANT' | 'EMPLOYEE' | 'VENDOR' | 'OTHER';

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

export type ContactRow = {
  id: string;
  code: string | null;
  kind: ContactKind;
  name: string;
  name_en: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  id_number: string | null;
  tax_number: string | null;
  shop_number: string | null;
  floor: string | null;
  area_sqm: string | null;
  contract_start: string | null;
  contract_end: string | null;
  monthly_rent: string | null;
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  salary: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  creator: Pick<ProfileRow, 'id' | 'full_name_ar' | 'full_name'> | null;
  contact: Pick<ContactRow, 'id' | 'name' | 'kind' | 'shop_number'> | null;
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
  contact_id?: string;
  contact_type?: 'PAYER' | 'RECEIVER' | 'BENEFICIARY';
  /** false = skip FIFO auto allocation (use charge_allocations) */
  auto_allocate_charges?: boolean;
  charge_allocations?: ChargeAllocationInput[];
};

export type ChargeAllocationInput = {
  charge_id: string;
  amount: number;
};

/** مسودة حقل مصروف/إيراد — يُخزَّن كـ JSON حتى يُستأنف لاحقاً */
export type TransactionDraftPayload = {
  amount?: string;
  category_id?: string;
  cashbox_id?: string;
  method?: PaymentMethod;
  tx_date?: string;
  description?: string;
  contact_id?: string;
  contact_kind?: 'ALL' | ContactKind;
};

export type TransactionFormDraftRow = {
  id: string;
  user_id: string;
  kind: TxKind;
  label: string | null;
  payload: TransactionDraftPayload;
  created_at: string;
  updated_at: string;
};

export type SaveTransactionDraftInput = {
  id?: string;
  kind: TxKind;
  label?: string | null;
  payload: TransactionDraftPayload;
};

/** إذن صرف — يطابق جداول Supabase في migrations/009_disbursement_vouchers.sql */
export type DisbursementVoucherRow = {
  id: string;
  voucher_number: string;
  voucher_date: string;
  payee: string;
  bank_name: string | null;
  account_number: string | null;
  method: PaymentMethod;
  notes: string | null;
  total_amount: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DisbursementVoucherLineRow = {
  id: string;
  voucher_id: string;
  sort_order: number;
  description: string;
  amount: string;
  created_at: string;
};

export type DisbursementVoucherWithLines = DisbursementVoucherRow & {
  disbursement_voucher_lines: DisbursementVoucherLineRow[];
};

export type SaveDisbursementVoucherInput = {
  voucher_number: string;
  voucher_date: string;
  payee: string;
  bank_name?: string | null;
  account_number?: string | null;
  method: PaymentMethod;
  notes?: string | null;
  cashbox_id?: string | null;
  category_id?: string | null;
  lines: { description: string; amount: number }[];
};

export type FiscalPeriodRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MallUnitRow = {
  id: string;
  unit_number: string;
  floor: string;
  area_sqm: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeaseContractRow = {
  id: string;
  tenant_id: string;
  unit_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  services_amount: string;
  deposit_amount: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  created_at: string;
  updated_at: string;
};

export type LeaseContractWithRelations = LeaseContractRow & {
  unit?: Pick<MallUnitRow, 'id' | 'unit_number' | 'floor' | 'area_sqm'> | null;
  tenant?: { id: string; name: string; phone: string | null } | null;
};

export type TenantChargeRow = {
  id: string;
  contract_id: string;
  amount: string;
  due_date: string;
  type: 'RENT' | 'SERVICE' | 'FINE' | 'OTHER';
  description: string;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  total_paid: string;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantChargeWithRelations = TenantChargeRow & {
  contract?: LeaseContractWithRelations | null;
};

export type TenantChargeAllocationRow = {
  id: string;
  charge_id: string;
  transaction_id: string;
  amount: string;
  allocated_at: string;
};

export type AccountMappingRow = {
  id: string;
  source_type: 'RENT_REVENUE' | 'SERVICE_REVENUE' | 'DEPOSIT_LIABILITY' | 'EXPENSE_CASH_ASSET' | 'REVENUE_CASH_ASSET';
  category_id: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};
