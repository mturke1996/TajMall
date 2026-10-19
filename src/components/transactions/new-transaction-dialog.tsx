'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useTxDialog, type TxKind } from '@/stores/transaction-dialog';
import { PAYMENT_METHODS } from '@/lib/constants';
import { cn, parseAmountInput, preferredCashboxId, todayISODate } from '@/lib/utils';
import {
  useCategories,
  useCashboxes,
  useCreateTransaction,
  useContact,
  useContacts,
  useTransactionFormDrafts,
  useSaveTransactionFormDraft,
  useDeleteTransactionFormDraft,
  useRecordRentPayment,
} from '@/lib/db/queries';
import { checkDuplicatesNow, duplicateQueryFor, useDuplicateCandidates, useEntryUsageRows } from '@/lib/db/entry-queries';
import { findPossibleDuplicates, duplicateSignature, duplicatesConfirmed } from '@/lib/duplicate-check';
import { buildUsage, suggestDescription } from '@/lib/entry-suggestions';
import { EARLIEST_ENTRY_DATE, entryDateError, needsDescriptionNudge, paymentNoteAr, validatePaymentDetails, withPaymentNote, type EntryMethod } from '@/lib/entry-guards';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useVisualViewportFit } from '@/lib/hooks/use-visual-viewport-fit';
import type { ContactRow, NewTransactionInput, TransactionFormDraftRow, PaymentMethod } from '@/lib/db/types';
import { PaymentReceiptSuccess, type PendingReceipt } from '@/components/receipts/payment-receipt-success';
import { RentRevenueMonthsBlock } from '@/components/rent/rent-revenue-months-block';
import { useRentPaymentPlan } from '@/components/rent/use-rent-payment-plan';
import { describeRentIssue } from '@/lib/rent-allocation';
import { isRentCategoryCode } from '@/lib/charge-invoice';
import {
  contactKindLabelAr,
  isCustomerServiceRevenueCode,
  isEmployeeSalaryCode,
  isVendorServiceExpenseCode,
  suggestedContactKindForTx,
  type PartyContactFilter,
} from '@/lib/party-contacts';
import { useTenantChargesForTenant } from '@/lib/db/mall-queries';
import { formatMonthLabelAr, formatMonthsLabelAr } from '@/lib/rent-months';
import { toast } from 'sonner';
import { usePermission } from '@/lib/supabase/use-permission';
import { ContactCreateDialog } from '@/components/contacts/form/contact-create-dialog';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { roleForEntry } from '@/lib/contacts/form-rules';
import { NEEDS_DB_UPDATE, friendlyError } from '@/lib/user-messages';
import { DuplicateNote, FIELD_CLASS, NATIVE_SELECT_CLASS, PartySuggestions, PaymentDetailsFields, SuggestionChip } from './entry-parts';
import { DEPOSIT_CODE } from '@/lib/lease-settlement';

/** يُرجع رسالة خطأ مفيدة من خطأ Supabase/Postgres بدل رسالة عامة. */
function extractSaveError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  const raw = e?.message?.trim() ?? '';
  if (e?.code === '42804' || (raw.includes('payment_method') && raw.includes('type text'))) {
    return `لم تُحفظ المعاملة: ${NEEDS_DB_UPDATE}`;
  }
  if (e?.code === '23502') return 'لم تُحفظ المعاملة: إعداد الحسابات غير مكتمل (حساب الخزينة غير مربوط) — أبلغ مسؤول النظام.';
  if (e?.code === '23503') return 'لم تُحفظ المعاملة: أحد الاختيارات (البند أو الخزينة أو الجهة) لم يعد موجوداً — أعد اختياره.';
  return `لم تُحفظ المعاملة: ${friendlyError(err, 'تعذّر الحفظ، حاول مجدداً.')}`;
}

const PARTY_FILTERS: { id: PartyContactFilter; label: string }[] = [
  { id: 'ALL', label: 'الكل' },
  { id: 'CUSTOMER', label: 'عميل' },
  { id: 'VENDOR', label: 'مورد' },
  { id: 'TENANT', label: 'مستأجر' },
  { id: 'EMPLOYEE', label: 'موظف' },
];

const EMPTY_DETAILS = { chequeNumber: '', chequeBank: '', chequeDate: '', reference: '' };
const PICKABLE_PARTY_KINDS = ['ALL', 'TENANT', 'EMPLOYEE', 'CUSTOMER', 'VENDOR'];

/** Focus a field once the render that shows it has been committed. */
function focusSoon(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export function NewTransactionDialog() {
  const {
    isOpen,
    openedAt,
    defaultKind,
    prefillContactId,
    prefillContactKind,
    prefillDescription,
    prefillAmount,
    prefillCategoryId,
    prefillCashboxId,
    prefillMethod,
    repeatOf,
    close,
  } = useTxDialog();
  const { can, loading: permLoading } = usePermission();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<TxKind>(defaultKind);
  const [amount, setAmount] = useState('');
  const [rawCategoryId, setCategoryId] = useState('');
  const [rawCashboxId, setCashboxId] = useState('');
  const [method, setMethod] = useState<EntryMethod>('CASH');
  const [date, setDate] = useState(() => todayISODate());
  const [description, setDescription] = useState('');
  const [rawContactId, setContactId] = useState('');
  const [contactKind, setContactKind] = useState<PartyContactFilter>('ALL');
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [createdContacts, setCreatedContacts] = useState<ContactRow[]>([]);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [detailErrors, setDetailErrors] = useState<{ chequeNumber?: string; chequeDate?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [rentMonths, setRentMonths] = useState<string[]>([]);
  // the tick «ليست مكررة» belongs to the set of matches it was given for
  const [dupAck, setDupAck] = useState<string | null>(null);
  const [dupAttention, setDupAttention] = useState(false);
  const [descNudged, setDescNudged] = useState(false);
  const [prefillCheck, setPrefillCheck] = useState<{ category: string | null; cashbox: string | null; contact: string | null; contactName?: string } | null>(null);
  // the whole save, including removing a used draft: the button stays disabled until it ends
  const [submitting, setSubmitting] = useState(false);
  // Set when a revenue is saved: the sheet then shows the receipt (print / WhatsApp) instead of the form. It
  // belongs to the opening that saved it, so the next opening starts on the form without clearing anything.
  const [saved, setSaved] = useState<{ pending: PendingReceipt; openedAt: number } | null>(null);
  const receipt = saved && saved.openedAt === openedAt ? saved.pending : null;

  // the panel exists only while open; a phone's keyboard must not cover the save button
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  useVisualViewportFit(panelEl, 'fill');
  // the description the rent months wrote, so a line the person typed is never overwritten by it
  const autoRentDescription = useRef('');

  const { data: drafts = [], isLoading: draftsLoading } = useTransactionFormDrafts(kind, isOpen);
  const saveDraft = useSaveTransactionFormDraft();
  const deleteDraft = useDeleteTransactionFormDraft();

  const { data: categoriesAll = [], isLoading: catsLoading, isError: catsError, refetch: refetchCats } = useCategories();
  const { data: cashboxData, isLoading: boxLoading, isError: boxError, refetch: refetchBoxes } = useCashboxes();
  const cashboxes = useMemo(() => cashboxData ?? [], [cashboxData]);
  const { data: contactsData, isLoading: contactsLoading, isError: contactsError, refetch: refetchContacts } = useContacts();
  const contactsAll = useMemo(() => contactsData ?? [], [contactsData]);
  const createTx = useCreateTransaction();
  const recordRentPayment = useRecordRentPayment();

  // the deposit account is a liability (kind ADJUSTMENT); an expense in it is the refund of a tenant's deposit
  const categories = useMemo(
    () => categoriesAll.filter((c) => (c.kind === kind || (kind === 'EXPENSE' && c.code === DEPOSIT_CODE)) && c.code !== 'EXP-TEST'),
    [categoriesAll, kind],
  );
  const isRevenue = kind === 'REVENUE';

  // A copied transaction names an account, a cashbox and a party that may have been archived since. Once the
  // lists have loaded, a choice that is no longer there is dropped and the dialog says so, instead of
  // posting to something the person cannot see. A list that failed to load says nothing about what it holds,
  // so nothing is dropped (or called archived) on its account; the list's own error state speaks instead.
  // The account is looked up among all kinds: switching to the other kind clears it without calling it gone.
  const prefillMissing = useMemo(() => {
    const known = (loading: boolean, failed: boolean, rows: number) => !loading && !(failed && rows === 0);
    return {
      category:
        !!prefillCheck?.category &&
        known(catsLoading, catsError, categoriesAll.length) &&
        !categoriesAll.some((c) => c.id === prefillCheck.category && c.code !== 'EXP-TEST'),
      cashbox: !!prefillCheck?.cashbox && known(boxLoading, boxError, cashboxes.length) && !cashboxes.some((c) => c.id === prefillCheck.cashbox),
      contact: !!prefillCheck?.contact && known(contactsLoading, contactsError, contactsAll.length) && !contactsAll.some((c) => c.id === prefillCheck.contact),
    };
  }, [prefillCheck, catsLoading, catsError, boxLoading, boxError, contactsLoading, contactsError, categoriesAll, cashboxes, contactsAll]);
  const categoryId = prefillMissing.category && rawCategoryId === prefillCheck?.category ? '' : rawCategoryId;
  const contactId = prefillMissing.contact && rawContactId === prefillCheck?.contact ? '' : rawContactId;
  const prefillNotes = [
    prefillMissing.category && 'بند المعاملة الأصلية لم يعد متاحاً؛ اختر بنداً.',
    prefillMissing.cashbox && 'خزينة المعاملة الأصلية غير نشطة؛ اختيرت الخزينة الافتراضية.',
    prefillMissing.contact &&
      `${prefillCheck?.contactName ? `الجهة «${prefillCheck.contactName}»` : 'جهة المعاملة الأصلية'} غير نشطة؛ لم تُنسخ، اختر جهة أخرى أو اتركها فارغة.`,
  ].filter((n): n is string => typeof n === 'string');

  // active parties plus the one just added here, which the list does not know yet
  const partyPool = useMemo(() => {
    const known = new Set(contactsAll.map((c) => c.id));
    return [...contactsAll, ...createdContacts.filter((c) => !known.has(c.id))];
  }, [contactsAll, createdContacts]);
  const parties = useMemo(() => (contactKind === 'ALL' ? partyPool : partyPool.filter((c) => c.kind === contactKind)), [partyPool, contactKind]);
  const listedContact = partyPool.find((c) => c.id === contactId);
  // a party that is not in the active list (archived, or opened from its own page) is read by id
  const unlistedContact = useContact(contactId && !listedContact && !contactsLoading ? contactId : '');
  const selectedContact = listedContact ?? unlistedContact.data;

  // Reset the form each time the dialog is opened (also when a new request arrives while it is open,
  // e.g. "new expense" from the command palette) — not on every re-render, or typing would be wiped
  // while the cashboxes load.
  const resetFor = useRef(0);
  useEffect(() => {
    const opening = isOpen && resetFor.current !== openedAt;
    if (opening) {
      resetFor.current = openedAt;
      setKind(defaultKind);
      setAmount(prefillAmount ? String(prefillAmount) : '');
      setCategoryId(prefillCategoryId ?? '');
      setCashboxId(prefillCashboxId ?? preferredCashboxId(cashboxes));
      setMethod(prefillMethod ?? 'CASH');
      setDate(todayISODate());
      setDescription(prefillDescription ?? '');
      const prefKind =
        prefillContactKind && PICKABLE_PARTY_KINDS.includes(prefillContactKind)
          ? (prefillContactKind as PartyContactFilter)
          : suggestedContactKindForTx(defaultKind, null);
      setContactKind(prefKind);
      setContactId(prefillContactId ?? '');
      setShowNewContact(false);
      setNewContactName('');
      setCreatedContacts([]);
      setDetails(EMPTY_DETAILS);
      setDetailErrors({});
      setError(null);
      setEditingDraftId(null);
      setDraftsOpen(false);
      setRentMonths([]);
      setDupAck(null);
      setDupAttention(false);
      setDescNudged(false);
      setSubmitting(false);
      autoRentDescription.current = '';
      setPrefillCheck(
        prefillCategoryId || prefillCashboxId || (repeatOf && prefillContactId)
          ? { category: prefillCategoryId, cashbox: prefillCashboxId, contact: repeatOf ? prefillContactId : null, contactName: repeatOf?.contactName }
          : null,
      );
    }
  }, [isOpen, openedAt, defaultKind, cashboxes, prefillContactId, prefillContactKind, prefillDescription, prefillAmount, prefillCategoryId, prefillCashboxId, prefillMethod, repeatOf]);

  // no choice yet means the preferred box, also when the cashboxes arrive after the dialog opened
  const effectiveCashboxId = (prefillMissing.cashbox && rawCashboxId === prefillCheck?.cashbox ? '' : rawCashboxId) || preferredCashboxId(cashboxes);

  const createPerm = kind === 'REVENUE' ? 'revenue.create' : 'expense.create';
  const canRevenue = !permLoading && can('revenue.create');
  const canExpense = !permLoading && can('expense.create');

  // Opened for a kind this user may not record: switch to the other kind, or close if neither.
  useEffect(() => {
    if (!isOpen || permLoading) return;
    if (can(createPerm)) return;
    const other: TxKind = kind === 'REVENUE' ? 'EXPENSE' : 'REVENUE';
    if (can(other === 'REVENUE' ? 'revenue.create' : 'expense.create')) {
      setKind(other);
      setCategoryId('');
      // the party filter followed the kind it was opened for (customers for a revenue)
      if (!prefillContactKind) setContactKind(suggestedContactKindForTx(other, null));
      return;
    }
    close();
    toast.error('صلاحية القراءة فقط — لا يمكن إضافة معاملات');
  }, [isOpen, permLoading, createPerm, can, close, kind, prefillContactKind]);

  // Escape closes it like every other dialog in the app, unless a list opened over it took the key first.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // focus goes back to what opened the dialog, so a keyboard user is not dropped at the top of the page
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      const opener = useTxDialog.getState().opener;
      if (opener?.isConnected) opener.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);


  const selectedCategory = categoriesAll.find((c) => c.id === categoryId);
  const showRentAllocation =
    isRevenue &&
    !!contactId &&
    selectedContact?.kind === 'TENANT' &&
    isRentCategoryCode(selectedCategory?.code);

  const tenantChargesQuery = useTenantChargesForTenant(showRentAllocation ? contactId : '');
  const tenantCharges = useMemo(() => tenantChargesQuery.data ?? [], [tenantChargesQuery.data]);
  const tenantMonthlyRent = Number(selectedContact?.monthly_rent) || 0;
  const amountParsed = parseAmountInput(amount);
  const amountNumber = Number.isFinite(amountParsed) ? amountParsed : 0;
  // The rent split is the same one the tenant payment dialog shows (src/lib/rent-allocation.ts).
  const rentPlan = useRentPaymentPlan({
    tenantId: showRentAllocation ? contactId : '',
    contactRent: tenantMonthlyRent,
    charges: tenantCharges,
    months: rentMonths,
    amount: amountNumber,
  });
  // months that could not be read are not "no months": the split would be built on nothing
  const chargesFailed = showRentAllocation && tenantChargesQuery.isError && !tenantChargesQuery.data;
  const rentReady = showRentAllocation && !chargesFailed && !rentPlan.loading && tenantChargesQuery.isFetched;
  const setRentAmount = useCallback((n: number) => setAmount(n > 0 ? String(n) : ''), []);

  // The months chosen write the description, but never over a line the person typed themselves.
  useEffect(() => {
    if (!showRentAllocation || rentMonths.length === 0) return;
    const next = `تحصيل إيجار: ${formatMonthsLabelAr([...rentMonths].sort())}`;
    // the updater runs later, so it must compare with the text written last time, not the one written now
    const written = autoRentDescription.current;
    autoRentDescription.current = next;
    setDescription((current) => (current.trim() === '' || current === written ? next : current));
  }, [rentMonths, showRentAllocation]);

  // ── picking lists: who and what are used most, searched with Arabic normalisation ──
  const usageRows = useEntryUsageRows(kind, isOpen);
  const usage = useMemo(() => buildUsage(usageRows.data ?? [], todayISODate()), [usageRows.data]);

  const partyOptions = useMemo<ComboboxOption[]>(
    () =>
      parties.map((c) => ({
        value: c.id,
        label: c.name,
        hint: [c.shop_number ? `محل ${c.shop_number}` : null, c.job_title, c.phone].filter(Boolean).join(' · ') || undefined,
        tag: contactKind === 'ALL' ? contactKindLabelAr(c.kind) : undefined,
        search: [
          c.name,
          { text: c.name_en, weight: 0.8 },
          c.shop_number,
          { text: c.shop_number ? `محل ${c.shop_number}` : null, weight: 0.8 },
          { text: c.phone, digits: true, weight: 0.8 },
          { text: c.phone2, digits: true, weight: 0.7 },
          { text: c.code, weight: 0.6 },
          { text: c.job_title, weight: 0.5 },
        ],
      })),
    [parties, contactKind],
  );

  const categoryOptions = useMemo<ComboboxOption[]>(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: c.name_ar,
        hint: c.code,
        search: [c.name_ar, { text: c.code, weight: 0.8 }, { text: c.name, weight: 0.6 }],
      })),
    [categories],
  );

  function pickCategory(nextId: string) {
    setCategoryId(nextId);
    // the party list follows the account, unless a party is already chosen
    if (!contactId) {
      const code = categoriesAll.find((c) => c.id === nextId)?.code;
      setContactKind(suggestedContactKindForTx(kind, code));
    }
  }

  // ── the duplicate check: a narrow query (kind, amount, a week of dates) once typing pauses ──
  // The query follows the settled values; what is shown always follows the current ones, so a warning
  // about an amount that has since been changed (or about the previous entry) is never on screen.
  const [settledAmount, flushAmount] = useDebouncedValue(amount, 450);
  const [settledDate, flushDate] = useDebouncedValue(date, 450);
  const typingSettled = settledAmount === amount && settledDate === date;
  const duplicateQuery = typingSettled ? duplicateQueryFor({ kind, amount: parseAmountInput(settledAmount), date: settledDate }) : null;
  const duplicateRows = useDuplicateCandidates(duplicateQuery, isOpen);
  const dupMatches = useMemo(
    () => findPossibleDuplicates({ kind, amount: parseAmountInput(amount), contactId, categoryId, date }, duplicateRows.data ?? []),
    [kind, amount, contactId, categoryId, date, duplicateRows.data],
  );
  const dupSignature = duplicateSignature(dupMatches);
  const dupAcknowledged = dupMatches.length > 0 && dupAck === dupSignature;
  const dupCheckFailed = duplicateRows.isError && !duplicateRows.data;

  // ── the description: a suggestion to take, never one that is filled in silently ──
  const descriptionSuggestion = useMemo(
    () => suggestDescription({ categoryName: selectedCategory?.name_ar, contactName: selectedContact?.name, date }),
    [selectedCategory?.name_ar, selectedContact?.name, date],
  );
  const showDescriptionChip = description.trim() === '' && !!descriptionSuggestion && !showRentAllocation;
  const showDescriptionNudge = descNudged && description.trim() === '';

  function fail(message: string, focusId?: string) {
    setError(message);
    if (focusId) focusSoon(focusId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!can(createPerm)) {
      setError('ليس لديك صلاحية إضافة هذه المعاملة');
      return;
    }

    const amountNum = parseAmountInput(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      fail('أدخل مبلغاً صحيحاً أكبر من صفر، بثلاث خانات عشرية على الأكثر.', 'tx-amount');
      return;
    }
    // the form is validated here, not by the browser, so the date field's min and max are enforced in code
    const dateProblem = entryDateError(date, todayISODate());
    if (dateProblem) {
      fail(dateProblem, 'tx-date');
      return;
    }
    if (!categoryId) {
      fail('اختر البند', 'tx-category');
      return;
    }
    if (!effectiveCashboxId) {
      fail('اختر الخزينة', 'tx-cashbox');
      return;
    }

    const payment = validatePaymentDetails({ method, ...details });
    setDetailErrors(payment.errors);
    if (!payment.ok) {
      fail(payment.errors.chequeNumber ?? payment.errors.chequeDate ?? 'راجع بيانات الصك.', payment.errors.chequeNumber ? 'tx-cheque-number' : 'tx-cheque-date');
      return;
    }

    if (showRentAllocation) {
      if (!rentReady) {
        setError(chargesFailed ? 'تعذّر تحميل أشهر المستأجر. أعد المحاولة ثم رحّل.' : 'انتظر تحميل أشهر المستأجر');
        return;
      }
      if (!rentPlan.plan.ok) {
        setError(describeRentIssue(rentPlan.plan.issues[0], formatMonthLabelAr));
        return;
      }
    }

    setSubmitting(true);
    try {
      // The guard rails stop at most once each and never block genuine work: a payment that looks like a
      // copy needs the tick «ليست مكررة»; a missing description is pointed out once.
      let matches = dupMatches;
      const query = duplicateQueryFor({ kind, amount: amountNum, date });
      if (query) {
        try {
          const rows = await checkDuplicatesNow(queryClient, query);
          matches = findPossibleDuplicates({ kind, amount: amountNum, contactId, categoryId, date }, rows);
        } catch {
          // a check that cannot run is not a reason to refuse the entry; the note under the form says so
        }
      }
      const duplicateBlocks = !duplicatesConfirmed(matches, dupAck);
      const nudge = needsDescriptionNudge({ description, alreadyNudged: descNudged, autoDescribed: showRentAllocation });
      if (duplicateBlocks || nudge) {
        if (nudge) setDescNudged(true);
        if (duplicateBlocks) {
          // show exactly the rows just checked, without waiting for the typing pause
          flushAmount();
          flushDate();
          setDupAttention(true);
        }
        focusSoon(duplicateBlocks ? 'tx-dup-ack' : 'tx-description');
        return;
      }

      const text = description.trim();
      // what the receipt is built from, once a revenue is saved
      let pending: PendingReceipt | null = null;
      /** مسار إيجار ذرّي: معاملة + قيد + ربط في RPC واحد */
      if (showRentAllocation && contactId && rentMonths.length > 0) {
        const paid = await recordRentPayment.mutateAsync({
          tenant_id: contactId,
          amount: amountNum,
          payment_date: date,
          cashbox_id: effectiveCashboxId,
          // this function takes no cheque columns, so a cheque or transfer is named in the description
          description: withPaymentNote(text || `تحصيل إيجار: ${formatMonthsLabelAr(rentMonths)}`, paymentNoteAr(method, payment.fields)),
          rent_months: [...rentMonths].sort(),
          payment_method: method,
        });
        // the mutation already refreshes every money query, the tenant's rent calendar included
        if (paid.transaction_id) {
          pending = {
            kind: 'rent',
            transactionId: paid.transaction_id,
            amount: amountNum,
            tenant: { name: selectedContact?.name ?? '', shopNumber: selectedContact?.shop_number ?? null, phone: selectedContact?.phone ?? null },
            lines: rentPlan.plan.lines,
            // this form does not read the tenant's whole account, so the receipt does not claim to know it
            otherOwing: null,
          };
        }
      } else {
        const input: NewTransactionInput & typeof payment.fields = {
          kind,
          amount: amountNum,
          method,
          category_id: categoryId,
          cashbox_id: effectiveCashboxId,
          tx_date: date,
          description: text || undefined,
          contact_id: contactId || undefined,
          contact_type: contactId ? (isRevenue ? 'PAYER' : 'BENEFICIARY') : undefined,
          auto_allocate_charges: false,
          ...payment.fields,
        };
        const created = await createTx.mutateAsync(input);
        if (isRevenue) pending = { kind: 'revenue', tx: created };
      }
      if (editingDraftId) {
        try {
          await deleteDraft.mutateAsync({ id: editingDraftId, kind });
        } catch {
          /* ignore */
        }
        setEditingDraftId(null);
      }
      // A saved revenue stays on screen as its receipt; an expense, or a sheet dismissed while saving, closes as before.
      const live = useTxDialog.getState();
      if (pending && live.isOpen && live.openedAt === openedAt) {
        setSaved({ pending, openedAt });
        return;
      }
      toast.success(
        showRentAllocation && rentMonths.length > 0
          ? `تم الإيراد وربط ${formatMonthsLabelAr(rentMonths)} بالقيد`
          : isRevenue
            ? 'تم الإيراد'
            : 'تم الصرف',
      );
      close();
    } catch (err) {
      console.error('فشل حفظ المعاملة:', err);
      const msg = extractSaveError(err);
      setError(msg);
      // dismissed while the save was running: the form is gone, so the failure would go unseen
      if (!useTxDialog.getState().isOpen) toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // the role a new contact starts with: what the party filter says, else what the entry is (rent paid is a landlord)
  const newContactRole: ContactBusinessRole = roleForEntry({
    kind: isRevenue ? 'REVENUE' : 'EXPENSE',
    partyFilter: contactKind,
    categoryCode: selectedCategory?.code,
  });

  function handleContactCreated(newContact: ContactRow) {
    setCreatedContacts((list) => [...list, newContact]);
    setContactId(newContact.id);
    setContactKind(newContact.kind === 'OTHER' ? 'ALL' : newContact.kind);
    // the name belonged to this contact: the next «+» starts empty
    setNewContactName('');
  }

  function applyDraft(row: TransactionFormDraftRow) {
    setEditingDraftId(row.id);
    const p = row.payload;
    setAmount(p.amount ?? '');
    setCategoryId(p.category_id ?? '');
    setCashboxId(p.cashbox_id ?? preferredCashboxId(cashboxes));
    setMethod((p.method as PaymentMethod) ?? 'CASH');
    setDate(p.tx_date ?? todayISODate());
    setDescription(p.description ?? '');
    setContactId(p.contact_id ?? '');
    const ck = p.contact_kind ?? 'ALL';
    if (ck === 'ALL' || ck === 'TENANT' || ck === 'EMPLOYEE' || ck === 'CUSTOMER' || ck === 'VENDOR') {
      setContactKind(ck);
    } else {
      setContactKind('ALL');
    }
    setError(null);
    setDraftsOpen(false);
    toast.success('تم تحميل المسودة', { description: row.label ?? undefined });
  }

  async function handleSaveDraft() {
    try {
      const auto =
        amount.trim() !== ''
          ? `${kind === 'REVENUE' ? 'إيراد' : 'مصروف'} ${amount} د.ل`
          : kind === 'REVENUE'
            ? 'مسودة إيراد'
            : 'مسودة مصروف';
      const row = await saveDraft.mutateAsync({
        id: editingDraftId ?? undefined,
        kind,
        label: `${auto} · ${new Date().toLocaleString('ar-LY')}`,
        payload: {
          amount,
          category_id: categoryId || undefined,
          cashbox_id: effectiveCashboxId || undefined,
          method,
          tx_date: date,
          description: description || undefined,
          contact_id: contactId || undefined,
          contact_kind: contactKind,
        },
      });
      setEditingDraftId(row.id);
      toast.success('تم حفظ المسودة');
    } catch {
      toast.error('تعذّر حفظ المسودة — تأكد من تسجيل الدخول وتطبيق ترحيل قاعدة البيانات');
    }
  }

  // keeps Tab inside the dialog; lists that open over it are portals and handle their own focus
  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const panel = e.currentTarget as HTMLElement;
    if (!panel.contains(e.target as Node)) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'),
    ).filter((el) => el.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!isOpen) return null;

  // a stray tap beside the sheet must not throw away a half-typed entry; X, إلغاء and Escape still leave
  const dirty =
    !receipt &&
    (amount.trim() !== '' ||
      description.trim() !== '' ||
      categoryId !== '' ||
      contactId !== '' ||
      details.chequeNumber.trim() !== '' ||
      details.reference.trim() !== '');

  const kindButton = (value: TxKind, label: string, allowed: boolean, denied: string) => (
    <button
      type="button"
      aria-pressed={kind === value}
      disabled={!allowed}
      title={allowed ? undefined : denied}
      onClick={() => {
        setKind(value);
        setCategoryId('');
        setContactKind(suggestedContactKindForTx(value, null));
      }}
      className={cn(
        'min-h-11 rounded-md text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9',
        kind === value ? (value === 'REVENUE' ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink') : 'text-ink-soft hover:bg-muted',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50" dir="rtl">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => {
          if (!dirty) close();
        }}
      />
      {/* a full-height sheet on a phone, a centred card from 640px */}
      <div
        ref={setPanelEl}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-tx-title"
        onKeyDown={onPanelKeyDown}
        className="absolute inset-0 flex flex-col bg-card sm:inset-x-0 sm:bottom-auto sm:top-1/2 sm:mx-auto sm:max-h-[min(92dvh,56rem)] sm:max-w-lg sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-lift"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border ps-4 pe-1.5 sm:h-14">
          <h2 id="new-tx-title" className="py-3 text-[15px] font-semibold">
            {isRevenue ? 'إيراد جديد' : 'مصروف جديد'}
          </h2>
          {editingDraftId ? <span className="rounded-full border border-border bg-canvas-sunken px-2 py-0.5 text-[11.5px] text-ink-mute">مسودة محفوظة</span> : null}
          <Button type="button" variant="ghost" size="icon" aria-label="إغلاق" onClick={close} className="ms-auto size-11">
            <X className="stroke-[1.6]" />
          </Button>
        </div>

        {/* kept mounted under the receipt, so nothing typed is lost if the person goes back */}
        <form onSubmit={onSubmit} noValidate className={cn('flex min-h-0 flex-1 flex-col', receipt && 'hidden')}>
          {/* Fields */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
            {repeatOf || prefillNotes.length > 0 ? (
              <div className="rounded-lg border border-info-line bg-info-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-info-ink" role="status">
                {repeatOf && (
                  <p>
                    <span className="font-medium">نسخة من المعاملة </span>
                    <span dir="ltr" className="font-medium tabular-nums">
                      #{repeatOf.number}
                    </span>
                    <span>. التاريخ اليوم؛ راجع المبلغ والبيان قبل الترحيل.</span>
                  </p>
                )}
                {prefillNotes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            ) : null}

            {(draftsLoading || drafts.length > 0) && (
              <div className="rounded-lg border border-border bg-canvas-sunken/50">
                <button
                  type="button"
                  aria-expanded={draftsOpen}
                  aria-controls="tx-drafts"
                  onClick={() => setDraftsOpen((o) => !o)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-[13px] font-medium sm:min-h-9"
                >
                  مسوداتك المحفوظة
                  <span className="flex items-center gap-2 text-ink-mute">
                    {draftsLoading ? <Loader2 className="size-3.5 animate-spin" aria-label="جارٍ التحميل" /> : <span className="tabular-nums">{drafts.length}</span>}
                    <ChevronDown className={cn('size-4 stroke-[1.6]', draftsOpen && 'rotate-180')} aria-hidden />
                  </span>
                </button>
                {draftsOpen && !draftsLoading && (
                  <ul id="tx-drafts" className="divide-y divide-border border-t border-border">
                    {drafts.map((d) => (
                      <li key={d.id} className={cn('flex items-stretch', editingDraftId === d.id && 'bg-muted/50')}>
                        <button type="button" className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center px-3 py-1.5 text-start hover:bg-muted/50" onClick={() => applyDraft(d)}>
                          <span className="line-clamp-2 text-[13px] font-medium leading-snug">{d.label || 'مسودة بدون عنوان'}</span>
                          <span className="text-[12px] text-ink-mute">{new Date(d.updated_at).toLocaleString('ar-LY')}</span>
                        </button>
                        <Button
                          aria-label="حذف المسودة"
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11 h-auto shrink-0 rounded-none text-muted-foreground hover:text-danger-ink"
                          disabled={deleteDraft.isPending}
                          onClick={() =>
                            deleteDraft.mutate(
                              { id: d.id, kind },
                              {
                                onSuccess: () => {
                                  toast.success('تم حذف المسودة');
                                  if (editingDraftId === d.id) setEditingDraftId(null);
                                },
                                onError: () => toast.error('تعذّر حذف المسودة'),
                              },
                            )
                          }
                        >
                          <Trash2 className="stroke-[1.6]" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* النوع */}
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="نوع المعاملة">
              {kindButton('REVENUE', 'إيراد', canRevenue, 'لا تملك صلاحية تسجيل إيراد')}
              {kindButton('EXPENSE', 'مصروف', canExpense, 'لا تملك صلاحية تسجيل مصروف')}
            </div>

            {/* المبلغ */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-amount">المبلغ (د.ل)</Label>
              <Input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-xl font-semibold tabular-nums sm:h-10 sm:text-lg"
                autoFocus
              />
            </div>

            {/* الجهة: عميل / مورد / مستأجر / موظف */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="tx-contact">{isRevenue ? 'المسدِّد' : 'المستفيد'} (اختياري)</Label>
              <div className="grid grid-cols-5 gap-0.5 rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="نوع الجهة">
                {PARTY_FILTERS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={contactKind === chip.id}
                    onClick={() => setContactKind(chip.id)}
                    className={cn(
                      'min-h-11 rounded-md px-1 text-[12.5px] sm:min-h-8',
                      contactKind === chip.id ? 'bg-card font-medium text-foreground shadow-whisper' : 'text-ink-mute hover:text-foreground',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Combobox
                  id="tx-contact"
                  className="min-w-0 flex-1"
                  value={contactId}
                  onValueChange={setContactId}
                  options={partyOptions}
                  usage={usage.contacts}
                  placeholder="اختر الجهة"
                  fallbackLabel={selectedContact?.name}
                  searchPlaceholder="ابحث بالاسم أو رقم المحل أو الهاتف"
                  title={isRevenue ? 'اختر المسدِّد' : 'اختر المستفيد'}
                  allHeading="كل الجهات"
                  clearLabel="بدون جهة"
                  emptyText={contactKind === 'ALL' ? 'لا توجد جهات بعد.' : `لا توجد جهات من نوع «${contactKindLabelAr(contactKind)}». جرّب «الكل».`}
                  loading={contactsLoading}
                  error={contactsError && contactsAll.length === 0 ? 'تعذّر تحميل الجهات.' : null}
                  onRetry={() => void refetchContacts()}
                  onCreate={{
                    label: (q) => `إضافة «${q}» كجهة جديدة`,
                    run: (q) => {
                      setNewContactName(q);
                      setShowNewContact(true);
                    },
                  }}
                />
                <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 sm:size-9" aria-label="إضافة جهة جديدة" onClick={() => { setNewContactName(''); setShowNewContact(true); }}>
                  <Plus className="stroke-[1.6]" />
                </Button>
              </div>

              {selectedCategory && isCustomerServiceRevenueCode(selectedCategory.code) && isRevenue ? (
                <p className="text-[12.5px] leading-snug text-ink-mute">إيراد خدمة/مواقف — يمكن ربطه بعميل مباشرة دون عقد إيجار.</p>
              ) : null}
              {selectedCategory && isVendorServiceExpenseCode(selectedCategory.code) && !isRevenue ? (
                <p className="text-[12.5px] leading-snug text-ink-mute">مصروف تشغيلي — يُفضَّل ربطه بمورد لتتبع الإنفاق.</p>
              ) : null}
              {selectedCategory && isEmployeeSalaryCode(selectedCategory.code) && !isRevenue ? (
                <p className="text-[12.5px] leading-snug text-ink-mute">مصروف مرتبات — يُفضَّل ربطه بموظف.</p>
              ) : null}
              {isRevenue && selectedCategory?.code === 'REV-RNT' && selectedContact?.kind !== 'TENANT' ? (
                <p className="text-[12.5px] leading-snug text-warning-ink">
                  إيجار محل دون مستأجر: لن يُربط التحصيل بأي شهر ولن يُخصم من مستحقات أحد. اختر المستأجر من القائمة.
                </p>
              ) : null}

              {contactId && (
                <PartySuggestions
                  contactId={contactId}
                  kind={kind}
                  categoryId={categoryId}
                  amount={amountNumber}
                  categories={categories}
                  onPickCategory={pickCategory}
                  onPickAmount={(n) => setAmount(String(n))}
                />
              )}
            </div>

            {/* البند */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-category">البند</Label>
              <Combobox
                id="tx-category"
                value={categoryId}
                onValueChange={pickCategory}
                options={categoryOptions}
                usage={usage.categories}
                placeholder="اختر البند"
                searchPlaceholder="ابحث باسم البند أو رمزه"
                title="اختر البند"
                allHeading="كل البنود"
                emptyText="لا توجد بنود لهذا النوع."
                loading={catsLoading}
                error={catsError && categoriesAll.length === 0 ? 'تعذّر تحميل البنود.' : null}
                onRetry={() => void refetchCats()}
              />
            </div>

            {showRentAllocation && contactId && (
              chargesFailed ? (
                <div role="alert" className="flex flex-wrap items-center gap-x-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink">
                  تعذّر تحميل أشهر المستأجر.
                  <Button type="button" variant="link" size="sm" className="h-auto min-h-11 text-[12.5px] text-danger-ink sm:min-h-0" onClick={() => void tenantChargesQuery.refetch()}>
                    أعد المحاولة
                  </Button>
                </div>
              ) : rentReady ? (
                <RentRevenueMonthsBlock
                  tenantId={contactId}
                  monthlyRent={tenantMonthlyRent}
                  charges={tenantCharges}
                  selected={rentMonths}
                  onSelectedChange={setRentMonths}
                  plan={rentPlan.plan}
                  basis={rentPlan.basis}
                  basisFor={rentPlan.basisFor}
                  onAmountChange={setRentAmount}
                  ready={rentReady}
                  autoSelectFirstDue
                />
              ) : (
                <div className="flex flex-col gap-2 py-1" role="status" aria-label="جارٍ تحميل أشهر المستأجر">
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </div>
              )
            )}

            {/* الخزينة وطريقة الدفع */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tx-cashbox">الخزينة</Label>
                <select
                  id="tx-cashbox"
                  value={effectiveCashboxId}
                  onChange={(e) => setCashboxId(e.target.value)}
                  className={NATIVE_SELECT_CLASS}
                  disabled={boxLoading}
                >
                  <option value="">اختر</option>
                  {cashboxes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tx-method">الطريقة</Label>
                <select id="tx-method" value={method} onChange={(e) => setMethod(e.target.value as EntryMethod)} className={NATIVE_SELECT_CLASS}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.labelAr}
                    </option>
                  ))}
                </select>
              </div>
              {!boxLoading && cashboxes.length === 0 && boxError ? (
                <p role="alert" className="col-span-2 flex flex-wrap items-center gap-x-2 text-[12.5px] text-danger-ink">
                  تعذّر تحميل الخزائن.
                  <Button type="button" variant="link" size="sm" className="h-auto min-h-11 text-[12.5px] sm:min-h-0" onClick={() => void refetchBoxes()}>
                    أعد المحاولة
                  </Button>
                </p>
              ) : null}
              {!boxLoading && cashboxes.length === 0 && !boxError && (
                <p className="col-span-2 text-[12.5px] text-danger-ink">لا توجد خزينة نشطة — أضف خزينة من صفحة الخزائن أولاً.</p>
              )}
            </div>

            <PaymentDetailsFields
              method={method}
              values={details}
              errors={detailErrors}
              onChange={(patch) => {
                setDetails((d) => ({ ...d, ...patch }));
                if (patch.chequeNumber !== undefined) setDetailErrors((er) => ({ ...er, chequeNumber: undefined }));
                if (patch.chequeDate !== undefined) setDetailErrors((er) => ({ ...er, chequeDate: undefined }));
              }}
            />

            {/* التاريخ */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-date">تاريخ العملية</Label>
              <Input
                id="tx-date"
                type="date"
                required
                value={date}
                max={todayISODate()}
                min={EARLIEST_ENTRY_DATE}
                onChange={(e) => setDate(e.target.value)}
                className={FIELD_CLASS}
              />
              <p className="text-[12.5px] leading-snug text-ink-mute">يمكن اختيار تاريخ سابق لتسجيل حركة قديمة.</p>
            </div>

            {/* البيان */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-description">البيان (اختياري)</Label>
              <Input
                id="tx-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف المعاملة"
                autoComplete="off"
                aria-describedby="tx-description-hint"
                className={FIELD_CLASS}
              />
              <div id="tx-description-hint" className="flex min-h-11 items-center sm:min-h-8" aria-live="polite">
                {showDescriptionNudge ? (
                  <p className="text-[12.5px] text-warning-ink">لا بيان للمعاملة. أضف سطراً يوضحها، أو اضغط «ترحيل الآن» مرة أخرى للمتابعة بدونه.</p>
                ) : null}
                {!showDescriptionNudge && showDescriptionChip ? (
                  <SuggestionChip
                    onClick={() => {
                      setDescription(descriptionSuggestion ?? '');
                      focusSoon('tx-description');
                    }}
                    label={`استخدم البيان المقترح: ${descriptionSuggestion}`}
                  >
                    <span className="text-ink-mute">اقتراح: </span>
                    <span className="text-foreground">{descriptionSuggestion}</span>
                  </SuggestionChip>
                ) : null}
                {!showDescriptionNudge && !showDescriptionChip && description.trim() === '' ? (
                  <p className="text-[12.5px] text-ink-mute">بيان قصير يسهّل مراجعة الكشف لاحقاً.</p>
                ) : null}
              </div>
            </div>

            {/* معاملة مشابهة */}
            <div aria-live="polite">
              {dupMatches.length > 0 ? (
                <DuplicateNote
                  matches={dupMatches}
                  acknowledged={dupAcknowledged}
                  onAcknowledge={(checked) => {
                    setDupAck(checked ? dupSignature : null);
                    if (checked) setDupAttention(false);
                  }}
                  attention={dupAttention}
                  checkboxId="tx-dup-ack"
                />
              ) : dupCheckFailed ? (
                <p className="text-[12.5px] text-ink-mute">تعذّر فحص المعاملات المشابهة؛ يمكنك المتابعة.</p>
              ) : null}
            </div>
          </div>

          {/* Actions: outside the scrolling area, so saving is always in reach */}
          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {error && (
              <p role="alert" className="text-[13px] text-danger-ink">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={close} className="h-11 flex-1 sm:h-9">
                إلغاء
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleSaveDraft()} disabled={saveDraft.isPending} className="h-11 flex-1 sm:h-9">
                {saveDraft.isPending ? <Loader2 className="animate-spin" aria-label="جارٍ الحفظ" /> : 'حفظ مسودة'}
              </Button>
              <Button type="submit" disabled={submitting} className="h-11 flex-[1.5] sm:h-9">
                {submitting ? <Loader2 className="animate-spin" aria-label="جارٍ الترحيل" /> : 'ترحيل الآن'}
              </Button>
            </div>
          </div>
        </form>
        {receipt ? <PaymentReceiptSuccess pending={receipt} onDone={close} /> : null}
      </div>
      {/* the same add form as the people lists; it opens over the entry and hands the new contact back */}
      <ContactCreateDialog
        open={showNewContact}
        onOpenChange={setShowNewContact}
        role={newContactRole}
        name={newContactName}
        onCreated={handleContactCreated}
      />
    </div>
  );
}
