'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Calculator,
  CheckCircle2,
  X,
  Hash,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Search,
  FileStack,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney } from '@/lib/utils';
import { useCategories, useContacts, useCashboxes } from '@/lib/db/queries';
import {
  useCreateJournalEntry,
  useUpdateJournalEntry,
  useJournalLines,
  useNextJournalReference,
  useJournalYearCount,
  useJournalFormDrafts,
  useSaveJournalFormDraft,
  useDeleteJournalFormDraft,
  type JournalEntryRow,
  type JournalFormDraftRow,
  type JournalDraftPayload,
} from '@/lib/db/journal-queries';
import { formatJournalReference } from '@/lib/journal-reference';
import {
  JOURNAL_TEMPLATES,
  JOURNAL_TEMPLATE_CATEGORIES,
  resolveTemplateLines,
  getTemplateMissingCodes,
  type JournalTemplate,
} from '@/lib/journal-templates';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { usePermission } from '@/lib/supabase/use-permission';
import { JournalNativeSelect } from './journal-native-select';
import { toast } from 'sonner';

type LineSide = 'debit' | 'credit';

type JournalLine = {
  id: string;
  category_id: string;
  side: LineSide;
  amount: string;
  description: string;
  contact_id?: string;
  cashbox_id?: string;
  showExtras: boolean;
};

function lineToPayload(line: JournalLine) {
  const amt = Number(line.amount) || 0;
  return {
    category_id: line.category_id,
    debit: line.side === 'debit' ? amt : 0,
    credit: line.side === 'credit' ? amt : 0,
    description: line.description || undefined,
    contact_id: line.contact_id || undefined,
    cashbox_id: line.cashbox_id || undefined,
  };
}

function emptyLine(id?: string): JournalLine {
  return {
    id: id ?? Math.random().toString(36).slice(2, 9),
    category_id: '',
    side: 'debit',
    amount: '',
    description: '',
    contact_id: '',
    cashbox_id: '',
    showExtras: false,
  };
}

function dbLineToForm(l: {
  id: string;
  category_id: string;
  debit: string;
  credit: string;
  description: string | null;
  contact_id: string | null;
  cashbox_id: string | null;
}): JournalLine {
  const debit = Number(l.debit);
  const credit = Number(l.credit);
  const isDebit = debit > 0;
  return {
    id: l.id,
    category_id: l.category_id,
    side: isDebit ? 'debit' : 'credit',
    amount: String(isDebit ? debit : credit || ''),
    description: l.description || '',
    contact_id: l.contact_id || '',
    cashbox_id: l.cashbox_id || '',
    showExtras: !!(l.contact_id || l.cashbox_id),
  };
}

export function JournalEntryDialog({
  open,
  onClose,
  editingEntry = null,
}: {
  open: boolean;
  onClose: () => void;
  editingEntry?: JournalEntryRow | null;
}) {
  const isEdit = !!editingEntry;
  useBodyScrollLock(open);
  const { can } = usePermission();

  const { data: categories = [] } = useCategories();
  const { data: contacts = [] } = useContacts();
  const { data: cashboxes = [] } = useCashboxes();
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const { data: drafts = [], isLoading: draftsLoading } = useJournalFormDrafts(open && !isEdit);
  const saveDraft = useSaveJournalFormDraft();
  const deleteDraft = useDeleteJournalFormDraft();

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [lines, setLines] = useState<JournalLine[]>([emptyLine('1'), emptyLine('2')]);

  const categoriesByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.code, c.id);
    return m;
  }, [categories]);

  const { data: dbLines } = useJournalLines(editingEntry?.id || '');
  const {
    data: rpcReference,
    isLoading: refLoading,
    isError: refRpcMissing,
  } = useNextJournalReference(entryDate, open && !isEdit);
  const { data: yearCount } = useJournalYearCount(entryDate, open && !isEdit && refRpcMissing);

  const year = new Date(entryDate + 'T12:00:00').getFullYear();

  const autoReference = useMemo(() => {
    if (isEdit) return editingEntry?.reference ?? '';
    if (rpcReference && !refRpcMissing) return rpcReference;
    if (yearCount != null) return formatJournalReference(year, yearCount + 1);
    return '';
  }, [isEdit, editingEntry?.reference, rpcReference, refRpcMissing, yearCount, year]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name_ar.toLowerCase().includes(q) ||
        (c.code?.toLowerCase().includes(q) ?? false),
    );
  }, [categories, categorySearch]);

  const categoryOptions = useMemo(
    () =>
      filteredCategories.map((c) => ({
        value: c.id,
        label: c.code ? `${c.name_ar} (${c.code})` : c.name_ar,
      })),
    [filteredCategories],
  );

  const contactOptions = useMemo(
    () => [
      { value: '', label: 'بدون جهة' },
      ...contacts.map((c) => ({
        value: c.id,
        label: getContactLabel(c),
      })),
    ],
    [contacts],
  );

  const cashboxOptions = useMemo(
    () => [
      { value: '', label: 'بدون خزينة' },
      ...cashboxes.map((cb) => ({
        value: cb.id,
        label: cb.code ? `${cb.name_ar} (${cb.code})` : cb.name_ar,
      })),
    ],
    [cashboxes],
  );

  useEffect(() => {
    if (!open) return;
    if (editingEntry) {
      setReference(editingEntry.reference || '');
      setEntryDate(
        editingEntry.entry_date
          ? editingEntry.entry_date.split('T')[0]
          : new Date().toISOString().split('T')[0],
      );
      setDescription(editingEntry.description || '');
      setNotes(editingEntry.notes || '');
      setCategorySearch('');
    } else {
      setEntryDate(new Date().toISOString().split('T')[0]);
      setReference('');
      setDescription('');
      setNotes('');
      setCategorySearch('');
      setTemplateAmount('');
      setEditingDraftId(null);
      setLines([emptyLine('1'), emptyLine('2')]);
    }
  }, [editingEntry, open]);

  useEffect(() => {
    if (editingEntry && dbLines && dbLines.length > 0) {
      setLines(dbLines.map(dbLineToForm));
    }
  }, [dbLines, editingEntry]);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) => {
    if (lines.length <= 2) {
      toast.error('القيود المزدوجة تتطلب سطرين على الأقل');
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<JournalLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const totals = lines.reduce(
    (acc, line) => {
      const amt = Number(line.amount) || 0;
      if (line.side === 'debit') acc.debit += amt;
      else acc.credit += amt;
      return acc;
    },
    { debit: 0, credit: 0 },
  );

  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.001 && totals.debit > 0;
  const difference = totals.debit - totals.credit;

  const autoBalance = () => {
    if (difference === 0) return;
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const absDiff = Math.abs(difference);
      const updated = [...prev];
      if (difference > 0) {
        updated[prev.length - 1] = {
          ...last,
          side: 'credit',
          amount: String(Number(last.amount || 0) + absDiff),
        };
      } else {
        updated[prev.length - 1] = {
          ...last,
          side: 'debit',
          amount: String(Number(last.amount || 0) + absDiff),
        };
      }
      return updated;
    });
    toast.success('تمت الموازنة التلقائية');
  };

  const buildDraftPayload = (): JournalDraftPayload => ({
    entry_date: entryDate,
    description,
    notes,
    lines: lines.map((l) => ({
      category_id: l.category_id,
      side: l.side,
      amount: l.amount,
      description: l.description,
      contact_id: l.contact_id,
      cashbox_id: l.cashbox_id,
    })),
  });

  const applyDraft = (row: JournalFormDraftRow) => {
    const p = row.payload;
    setEditingDraftId(row.id);
    setEntryDate(p.entry_date ?? new Date().toISOString().split('T')[0]);
    setDescription(p.description ?? '');
    setNotes(p.notes ?? '');
    if (p.lines && p.lines.length > 0) {
      setLines(
        p.lines.map((l, i) => ({
          id: `d-${i}`,
          category_id: l.category_id ?? '',
          side: l.side ?? 'debit',
          amount: l.amount ?? '',
          description: l.description ?? '',
          contact_id: l.contact_id ?? '',
          cashbox_id: l.cashbox_id ?? '',
          showExtras: !!(l.contact_id || l.cashbox_id),
        })),
      );
    }
    toast.success('تم تحميل المسودة');
  };

  const handleSaveDraft = async () => {
    if (!can('journal.create')) {
      toast.error('ليس لديك صلاحية حفظ مسودة قيد');
      return;
    }
    const label =
      description.trim() ||
      `مسودة قيد · ${new Date().toLocaleString('ar-LY', { dateStyle: 'short', timeStyle: 'short' })}`;
    const row = await saveDraft.mutateAsync({
      id: editingDraftId ?? undefined,
      label,
      payload: buildDraftPayload(),
    });
    setEditingDraftId(row.id);
  };

  const filteredTemplates = useMemo(() => {
    if (templateCategory === 'all') return JOURNAL_TEMPLATES;
    return JOURNAL_TEMPLATES.filter((t) => t.category === templateCategory);
  }, [templateCategory]);

  const applyTemplate = (template: JournalTemplate) => {
    const total = Number(templateAmount.replace(/[^\d.-]/g, ''));
    const resolved = resolveTemplateLines(template, categoriesByCode, total);
    if (!resolved) {
      const missing = getTemplateMissingCodes(template, categoriesByCode);
      toast.error(
        template.requires_total_amount && !(total > 0)
          ? 'أدخل المبلغ الإجمالي للقالب أولاً'
          : missing.length > 0
            ? `بنود ناقصة في دليل الحسابات: ${missing.join('، ')} — طبّق هجرة 013 أو أضف البنود`
            : 'تعذّر تطبيق القالب',
      );
      return;
    }
    setDescription(template.default_description);
    setLines(
      resolved.map((r, i) => ({
        id: `t-${i}`,
        category_id: r.category_id,
        side: r.side,
        amount: String(r.amount),
        description: r.description ?? '',
        contact_id: '',
        cashbox_id: '',
        showExtras: false,
      })),
    );
    toast.success(`تم تطبيق قالب: ${template.label}`);
  };

  const handleSubmit = async () => {
    if (isEdit && !can('journal.create')) {
      toast.error('ليس لديك صلاحية تعديل القيود');
      return;
    }
    if (!isEdit && !can('journal.create')) {
      toast.error('ليس لديك صلاحية إنشاء قيود');
      return;
    }

    const validLines = lines
      .filter((l) => l.category_id && Number(l.amount) > 0)
      .map(lineToPayload);

    if (validLines.length < 2) {
      toast.error('أدخل بندين على الأقل مع مبالغ');
      return;
    }

    if (!isBalanced) {
      toast.error('القيد غير متوازن — يجب تساوي المدين والدائن');
      return;
    }

    try {
      if (isEdit && editingEntry) {
        await updateEntry.mutateAsync({
          id: editingEntry.id,
          reference: reference || undefined,
          entry_date: entryDate,
          description: description || undefined,
          notes: notes || undefined,
          lines: validLines,
        });
      } else {
        // المرجع يُولَّد على السيرفر — لا نرسل قيمة معاينة لتجنب التعارض
        await createEntry.mutateAsync({
          entry_date: entryDate,
          description: description || undefined,
          notes: notes || undefined,
          lines: validLines,
        });
      }
      if (editingDraftId) {
        try {
          await deleteDraft.mutateAsync(editingDraftId);
        } catch {
          /* ignore */
        }
        setEditingDraftId(null);
      }
      onClose();
    } catch {
      /* toast from mutation */
    }
  };

  const isPending = createEntry.isPending || updateEntry.isPending;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" dir="rtl">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'absolute inset-0 flex flex-col bg-card sm:inset-x-4 sm:inset-y-auto',
          'sm:top-1/2 sm:left-1/2 sm:right-auto sm:bottom-auto sm:max-h-[92dvh] sm:w-[calc(100%-2rem)] sm:max-w-3xl',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:shadow-xl',
        )}
        role="dialog"
        aria-modal
        aria-labelledby="journal-entry-title"
      >
        {/* Header — safe area top on notched phones */}
        <div
          className="flex shrink-0 items-start gap-3 border-b px-4 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sage-100 text-sage-800">
            <Calculator className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="journal-entry-title" className="font-semibold text-base leading-snug">
              {isEdit ? 'تعديل قيد' : 'قيد يومية جديد'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {isEdit
                ? `قيد #${editingEntry?.number}`
                : 'المرجع تلقائي · مدين/دائن · موازنة فورية'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2.5 hover:bg-secondary touch-manipulation min-h-11 min-w-11 flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth-touch px-4 py-4 space-y-4">
          {!isEdit && (draftsLoading || drafts.length > 0) && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <FileStack className="h-3.5 w-3.5" />
                  مسودات محفوظة
                </span>
                {draftsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </div>
              {!draftsLoading &&
                drafts.map((d) => (
                  <div
                    key={d.id}
                    className={cn(
                      'flex gap-1 rounded-lg border bg-card/90',
                      editingDraftId === d.id && 'ring-1 ring-sage-400',
                    )}
                  >
                    <button
                      type="button"
                      className="flex-1 min-w-0 px-3 py-2.5 text-start text-xs touch-manipulation"
                      onClick={() => applyDraft(d)}
                    >
                      <span className="font-medium line-clamp-2">{d.label || 'مسودة بدون عنوان'}</span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {new Date(d.updated_at).toLocaleString('ar-LY')}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-auto min-h-11 touch-manipulation text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        deleteDraft.mutate(d.id, {
                          onSuccess: () => {
                            if (editingDraftId === d.id) setEditingDraftId(null);
                          },
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">تاريخ القيد *</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mt-1 h-12 touch-manipulation"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Hash className="h-3 w-3" />
                رقم المرجع
              </Label>
              {isEdit ? (
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 h-12"
                />
              ) : (
                <div className="mt-1 flex min-h-12 items-center gap-2 rounded-lg border border-dashed border-sage-300 bg-sage-50/80 px-3">
                  {refLoading && yearCount == null ? (
                    <Loader2 className="h-4 w-4 animate-spin text-sage-600" />
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-sage-600 shrink-0" />
                      <span className="font-mono text-sm font-semibold text-sage-900 truncate">
                        {autoReference || '—'}
                      </span>
                      <Badge variant="outline" className="mr-auto text-[10px] shrink-0">
                        تلقائي
                      </Badge>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">وصف القيد</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: تسوية خزينة"
              className="mt-1 h-12"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">بنود القيد</span>
              <span className="text-xs text-muted-foreground">{lines.length} بند</span>
            </div>

            {!isEdit && (
              <div className="rounded-xl border border-dashed border-sage-200 bg-sage-50/50 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sage-900">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  قوالب جاهزة
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="المبلغ للقالب"
                    value={templateAmount}
                    onChange={(e) => setTemplateAmount(e.target.value)}
                    className="h-11 flex-1 touch-manipulation"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x scroll-smooth-touch">
                  {JOURNAL_TEMPLATE_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTemplateCategory(c.id)}
                      className={cn(
                        'snap-center shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] touch-manipulation',
                        templateCategory === c.id
                          ? 'bg-sage-700 text-white border-sage-700'
                          : 'bg-card text-muted-foreground',
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 snap-x scroll-smooth-touch max-h-28">
                  {filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="snap-center shrink-0 rounded-lg border bg-card px-3 py-2 text-xs font-medium touch-manipulation active:bg-secondary min-h-11"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* بحث البنود — مهم على الهاتف مع قوائم طويلة */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="بحث عن بند محاسبي..."
                className="h-11 pr-10"
              />
            </div>

            {lines.map((line, index) => (
              <Card key={line.id} className="p-3.5 space-y-3 border-border/80 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    بند {index + 1}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-11 min-w-11 text-destructive touch-manipulation"
                    onClick={() => removeLine(line.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <JournalNativeSelect
                  label="الحساب *"
                  value={line.category_id}
                  onChange={(v) => updateLine(line.id, { category_id: v })}
                  options={categoryOptions}
                  placeholder="اختر البند"
                  required
                />

                <div className="space-y-2">
                  <Label className="text-xs">نوع الحركة والمبلغ *</Label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted/50">
                    <button
                      type="button"
                      onClick={() => updateLine(line.id, { side: 'debit' })}
                      className={cn(
                        'rounded-lg py-3 text-sm font-semibold touch-manipulation active:scale-[0.98]',
                        line.side === 'debit'
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'text-muted-foreground',
                      )}
                    >
                      مدين
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLine(line.id, { side: 'credit' })}
                      className={cn(
                        'rounded-lg py-3 text-sm font-semibold touch-manipulation active:scale-[0.98]',
                        line.side === 'credit'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'text-muted-foreground',
                      )}
                    >
                      دائن
                    </button>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min="0"
                    value={line.amount}
                    onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                    placeholder="0.000"
                    className="text-left text-xl font-bold h-14 touch-manipulation"
                  />
                </div>

                <div>
                  <Label className="text-xs">بيان السطر</Label>
                  <Input
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="اختياري"
                    className="mt-1 h-11"
                  />
                </div>

                <button
                  type="button"
                  className="flex w-full min-h-11 items-center justify-between text-xs text-muted-foreground touch-manipulation"
                  onClick={() => updateLine(line.id, { showExtras: !line.showExtras })}
                >
                  <span>جهة / خزينة (اختياري)</span>
                  {line.showExtras ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {line.showExtras && (
                  <div className="space-y-3 border-t border-dashed pt-3">
                    <JournalNativeSelect
                      label="الجهة"
                      value={line.contact_id || ''}
                      onChange={(v) => updateLine(line.id, { contact_id: v })}
                      options={contactOptions}
                    />
                    <JournalNativeSelect
                      label="الخزينة"
                      value={line.cashbox_id || ''}
                      onChange={(v) => updateLine(line.id, { cashbox_id: v })}
                      options={cashboxOptions}
                    />
                  </div>
                )}
              </Card>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addLine}
              className="w-full gap-1.5 h-12 touch-manipulation"
            >
              <Plus className="h-4 w-4" />
              إضافة بند
            </Button>
          </div>

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              className="mt-1 h-11"
            />
          </div>
        </div>

        <div
          className="shrink-0 border-t bg-card/95 backdrop-blur-sm px-4 py-3 space-y-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div
            className={cn(
              'rounded-xl px-3 py-2.5',
              isBalanced
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200',
            )}
          >
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              <span className="font-medium text-xs">
                {isBalanced ? 'القيد متوازن ✓' : 'غير متوازن'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <span>
                مدين:{' '}
                <strong className="text-green-700">{formatMoney(totals.debit, 'LYD')}</strong>
              </span>
              <span>
                دائن:{' '}
                <strong className="text-red-700">{formatMoney(totals.credit, 'LYD')}</strong>
              </span>
            </div>
            {!isBalanced && difference !== 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2 h-10 w-full touch-manipulation text-xs"
                onClick={autoBalance}
              >
                موازنة تلقائية ({formatMoney(Math.abs(difference), 'LYD')})
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {!isEdit && can('journal.create') && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={saveDraft.isPending}
                className="h-11 w-full touch-manipulation gap-1.5"
              >
                {saveDraft.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileStack className="h-4 w-4" />
                )}
                حفظ كمسودة
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isPending}
                className="h-12 touch-manipulation"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isBalanced || isPending || !can('journal.create')}
                className="h-12 gap-1.5 touch-manipulation"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isEdit ? 'حفظ' : 'إنشاء'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getContactLabel(c: { kind: string; name: string; shop_number?: string | null }) {
  const kinds: Record<string, string> = {
    TENANT: 'متجر',
    EMPLOYEE: 'موظف',
    VENDOR: 'مورد',
    CUSTOMER: 'عميل',
    OTHER: 'آخر',
  };
  const kindLabel = kinds[c.kind] || 'جهة';
  return `[${kindLabel}] ${c.name}${c.shop_number ? ` (${c.shop_number})` : ''}`;
}
