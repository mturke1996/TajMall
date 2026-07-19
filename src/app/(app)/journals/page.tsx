'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  BookOpen,
  Search,
  Loader2,
  Calendar,
  CheckCircle2,
  Clock,
  RotateCcw,
  Trash2,
  FileText,
  Filter,
  ChevronDown,
  ChevronUp,
  Copy,
  BookMarked,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import {
  useJournalEntries,
  useJournalSummary,
  usePostJournalEntry,
  useReverseJournalEntry,
  useDeleteJournalEntry,
  useDuplicateJournalEntry,
  useJournalLines,
  type JournalEntryRow,
  type JournalStatus,
} from '@/lib/db/journal-queries';
import { JournalEntryDialog } from './components/journal-entry-dialog';
import { JournalDetailDialog } from './components/journal-detail-dialog';
import { JournalConfirmSheet } from './components/journal-confirm-sheet';
import { JournalSourceBadge } from './components/journal-source-badge';
import { usePermission } from '@/lib/supabase/use-permission';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useContacts, useCashboxes } from '@/lib/db/queries';
import { MOBILE_PAGE_ACTION_PADDING } from '@/components/layout/mobile-page-action-bar';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { JournalVoucherTable } from '@/components/accounting/journal-voucher-table';
import { JournalBalanceBadge } from '@/components/accounting/journal-balance-badge';
import { mapJournalLineRowToVoucherLine } from '@/lib/journal-entry-display';

const STATUS_CONFIG: Record<JournalStatus, {
  label: string;
  icon: typeof CheckCircle2;
  color: string;
  bg: string;
  border: string;
}> = {
  POSTED: {
    label: 'مرحل',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  DRAFT: {
    label: 'مسودة',
    icon: Clock,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  REVERSED: {
    label: 'معكوس',
    icon: RotateCcw,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

export default function JournalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
        </div>
      }
    >
      <JournalsPageInner />
    </Suspense>
  );
}

function JournalsPageInner() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JournalStatus | 'ALL'>('ALL');
  const [contactFilter, setContactFilter] = useState<string | 'ALL'>('ALL');
  const [cashboxFilter, setCashboxFilter] = useState<string | 'ALL'>('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryRow | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntryRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'post' | 'reverse' | 'delete';
    entryId: string;
    entryNumber: number;
  } | null>(null);

  const { can, loading: permLoading } = usePermission();
  const { data: contacts = [] } = useContacts();
  const { data: cashboxes = [] } = useCashboxes();

  const {
    data: entries,
    isLoading: isLoadingEntries,
    isError: entriesQueryError,
    error: entriesQueryErr,
  } = useJournalEntries(
    {
      status: statusFilter,
      contactId: contactFilter,
      cashboxId: cashboxFilter,
      search: searchQuery,
    },
    500,
  );
  const {
    data: summary,
    isError: summaryQueryError,
    error: summaryQueryErr,
  } = useJournalSummary();

  const postEntry = usePostJournalEntry();
  const reverseEntry = useReverseJournalEntry();
  const deleteEntry = useDeleteJournalEntry();
  const duplicateEntry = useDuplicateJournalEntry();

  useEffect(() => {
    if (!highlightId) return;
    setExpandedId(highlightId);
    const timer = window.setTimeout(() => {
      document.getElementById(`journal-entry-${highlightId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const filteredEntries = useMemo(() => {
    const entryList = entries ?? [];
    if (!searchQuery) return entryList;
    const q = searchQuery.toLowerCase();
    return entryList.filter(
      (e) =>
        e.reference?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.number.toString().includes(q)
    );
  }, [entries, searchQuery]);

  const stats = useMemo(() => {
    if (!summary) return null;
    return [
      {
        label: 'إجمالي القيود',
        value: summary.total_entries,
        icon: BookOpen,
        color: 'bg-slate-100 text-slate-600',
      },
      {
        label: 'قيود مرحلة',
        value: summary.posted_entries,
        icon: CheckCircle2,
        color: 'bg-green-100 text-green-600',
      },
      {
        label: 'مسودات',
        value: summary.draft_entries,
        icon: Clock,
        color: 'bg-yellow-100 text-yellow-600',
      },
      {
        label: 'إجمالي مدين',
        value: formatMoney(Number(summary.total_debit), 'LYD'),
        icon: FileText,
        color: 'bg-emerald-100 text-emerald-700',
        isCurrency: true,
      },
      {
        label: 'إجمالي دائن',
        value: formatMoney(Number(summary.total_credit), 'LYD'),
        icon: FileText,
        color: 'bg-rose-100 text-rose-700',
        isCurrency: true,
      },
    ];
  }, [summary]);

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, entryId } = confirmAction;
    try {
      if (type === 'post') await postEntry.mutateAsync(entryId);
      if (type === 'reverse') await reverseEntry.mutateAsync(entryId);
      if (type === 'delete') await deleteEntry.mutateAsync(entryId);
      setExpandedId(null);
    } finally {
      setConfirmAction(null);
    }
  };

  const confirmCopy = {
    post: {
      title: 'ترحيل القيد',
      description: 'بعد الترحيل يُسجَّل القيد في الدفاتر ولا يمكن تعديله. هل تريد المتابعة؟',
      confirmLabel: 'ترحيل',
      variant: 'default' as const,
    },
    reverse: {
      title: 'عكس القيد',
      description: 'سيُنشأ قيد معكوس جديد ويُعلَّم القيد الحالي كمعكوس. هل تريد المتابعة؟',
      confirmLabel: 'عكس',
      variant: 'danger' as const,
    },
    delete: {
      title: 'حذف المسودة',
      description: 'سيتم حذف القيد نهائياً. لا يمكن التراجع.',
      confirmLabel: 'حذف',
      variant: 'danger' as const,
    },
  };

  const getContactLabel = (c: any) => {
    const kinds: Record<string, string> = {
      TENANT: 'متجر',
      EMPLOYEE: 'موظف',
      VENDOR: 'مورد',
      CUSTOMER: 'عميل',
      OTHER: 'آخر'
    };
    const kindLabel = kinds[c.kind] || 'جهة';
    return `[${kindLabel}] ${c.name} ${c.shop_number ? `(${c.shop_number})` : ''}`;
  };

  const buildJournalEntriesForPdf = async (entriesForPdf: JournalEntryRow[]) => {
    const supabase = createSupabaseBrowserClient();

    type LineRow = {
      debit: string;
      credit: string;
      description: string | null;
      category_name: string | null;
      category_code: string | null;
      sort_order: number;
    };

    return Promise.all(
      entriesForPdf.map(async (e) => {
        const { data: lineRows, error } = await supabase
          .from('journal_lines_with_categories')
          .select('debit, credit, description, category_name, category_code, sort_order')
          .eq('journal_id', e.id)
          .order('sort_order', { ascending: true });
        if (error) throw error;

        const lines = ((lineRows ?? []) as LineRow[]).map((l) => ({
          category_name: l.category_name ?? '—',
          category_code: l.category_code ?? '',
          debit: Number(l.debit),
          credit: Number(l.credit),
          description: l.description,
        }));

        return {
          ...e,
          lines,
          total_debit: Number(e.total_debit),
          total_credit: Number(e.total_credit),
        };
      }),
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="المحاسبة والتقارير"
        title="دفتر اليومية"
        description="نظام القيود المزدوجة - المدين والدائن - مع الترحيل والعكس"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5 hidden sm:inline-flex" asChild>
              <Link href="/reports/ledger">
                <BookMarked className="h-4 w-4" />
                دفتر الأستاذ
              </Link>
            </Button>
            <TajMallPdfToolbar
              fileName={`دفتر-اليومية-${new Date().getFullYear()}`}
              render={async () => {
                const [{ JournalPDF }] =
                  await Promise.all([
                    import('@/features/pdf/JournalPDF'),
                  ]);
                const pdfEntries = await buildJournalEntriesForPdf(filteredEntries);

                return (
                  <JournalPDF
                    entries={pdfEntries}
                    periodLabel={`السنة المالية ${new Date().getFullYear()}`}
                  />
                );
              }}
            />
            {can('journal.create') && (
              <Button
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="gap-1.5 hidden sm:inline-flex"
              >
                <Plus className="h-4 w-4" />
                قيد جديد
              </Button>
            )}
          </>
        }
      />

      <div
        className={cn(
          'flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10',
          MOBILE_PAGE_ACTION_PADDING,
        )}
      >
        {!permLoading && !can('journal.view') && (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            ليس لديك صلاحية عرض دفتر اليومية. تواصل مع المسؤول لتفعيل صلاحية journal.view.
          </Card>
        )}

        {(entriesQueryError || summaryQueryError) && (
          <Card className="border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">تعذّر تحميل بيانات دفتر اليومية</p>
            <p className="mt-2 text-red-800/90 leading-relaxed">
              {(entriesQueryErr as Error)?.message ??
                (summaryQueryErr as Error)?.message ??
                'طبّق هجرات Supabase بالترتيب: 007 ثم 012 ثم 015–017 (خصوصاً 017_fix_journal_rpc_and_ledger.sql) ثم أعد تحميل الصفحة.'}
            </p>
          </Card>
        )}

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.map((stat, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', stat.color)}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-ink-mute">{stat.label}</p>
                    <p className={cn('font-bold', stat.isCurrency ? 'text-base' : 'text-2xl')}>
                      {stat.value}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Search + status chips (always visible on mobile) */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <Input
              placeholder="بحث: رقم، مرجع، وصف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 h-11 touch-manipulation"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth-touch">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'snap-center px-3 py-2.5 text-sm rounded-lg whitespace-nowrap flex items-center gap-1.5 touch-manipulation min-h-11',
                statusFilter === 'ALL' ? 'bg-sage-700 text-white' : 'bg-canvas-sunken',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              الكل
            </button>
            {(Object.keys(STATUS_CONFIG) as JournalStatus[]).map((status) => {
              const config = STATUS_CONFIG[status];
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'snap-center px-3 py-2.5 text-sm rounded-lg whitespace-nowrap flex items-center gap-1.5 touch-manipulation min-h-11',
                    statusFilter === status ? 'bg-sage-700 text-white' : 'bg-canvas-sunken',
                  )}
                >
                  <config.icon className="h-3.5 w-3.5" />
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* Advanced filters — collapsed on phone */}
          <button
            type="button"
            className="md:hidden flex w-full items-center justify-between rounded-lg border bg-card px-3 py-2.5 text-sm touch-manipulation min-h-11"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <span className="font-medium">فلاتر الخزينة والجهة</span>
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <div
            className={cn(
              'grid grid-cols-1 gap-3',
              !filtersOpen && 'hidden md:grid md:grid-cols-2',
            )}
          >
            <Select value={cashboxFilter} onValueChange={setCashboxFilter}>
              <SelectTrigger className="bg-canvas h-11 touch-manipulation">
                <SelectValue placeholder="كل الخزائن" />
              </SelectTrigger>
              <SelectContent dir="rtl" className="max-h-[min(20rem,50vh)]">
                <SelectItem value="ALL">كل الخزائن والمصارف</SelectItem>
                {cashboxes.map((cb) => (
                  <SelectItem key={cb.id} value={cb.id}>
                    {cb.name_ar} {cb.code ? `(${cb.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={contactFilter} onValueChange={setContactFilter}>
              <SelectTrigger className="bg-canvas h-11 touch-manipulation">
                <SelectValue placeholder="كل الجهات" />
              </SelectTrigger>
              <SelectContent dir="rtl" className="max-h-[min(20rem,50vh)]">
                <SelectItem value="ALL">كل الجهات</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {getContactLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Entries List */}
        {isLoadingEntries ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <Card className="p-8 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-ink-mute mb-3" />
            <h3 className="font-medium text-lg">لا توجد قيود</h3>
            <p className="text-sm text-ink-mute mt-1">
              ابدأ بإنشاء قيد محاسبي جديد لتسجيل معاملة مزدوجة
            </p>
            <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              إنشاء قيد
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => {
              const status = STATUS_CONFIG[entry.status];
              const StatusIcon = status.icon;
              const isExpanded = expandedId === entry.id;
              const isBalanced = Number(entry.total_debit) === Number(entry.total_credit);

              return (
                <Card
                  key={entry.id}
                  id={`journal-entry-${entry.id}`}
                  className={cn(
                    'overflow-hidden transition-shadow',
                    highlightId === entry.id && 'ring-2 ring-sage-600 shadow-md',
                  )}
                >
                  {/* Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-secondary/50 transition-colors touch-manipulation active:bg-secondary/70"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={cn(
                          'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                          status.bg, status.border
                        )}>
                          <StatusIcon className={cn('h-5 w-5', status.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">قيد #{entry.number}</span>
                            {entry.reference && (
                              <span className="font-mono text-xs text-sage-800 bg-sage-50 border border-sage-200 rounded px-1.5 py-0.5 truncate max-w-[140px] sm:max-w-none">
                                {entry.reference}
                              </span>
                            )}
                            <Badge variant="outline" className={cn('text-xs', status.bg, status.color)}>
                              {status.label}
                            </Badge>
                            <JournalSourceBadge entry={entry} />
                            {!isBalanced && entry.status === 'DRAFT' && (
                              <Badge variant="danger" className="text-xs">
                                غير متوازن
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-mute mt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              {formatDate(entry.entry_date)}
                            </span>
                            <span className="hidden sm:inline text-ink-mute/50">•</span>
                            <span>{entry.line_count} بنود</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-border/50 pt-2 sm:border-0 sm:pt-0">
                        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                          <div className="grid grid-cols-2 gap-3 text-start sm:text-left" dir="ltr">
                            <div>
                              <p className="text-[10px] text-emerald-800">مدين</p>
                              <p className="font-mono text-sm font-semibold tabular-nums text-emerald-800">
                                {formatMoney(Number(entry.total_debit), 'LYD')}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-rose-800">دائن</p>
                              <p className="font-mono text-sm font-semibold tabular-nums text-rose-800">
                                {formatMoney(Number(entry.total_credit), 'LYD')}
                              </p>
                            </div>
                          </div>
                          <JournalBalanceBadge
                            debit={entry.total_debit}
                            credit={entry.total_credit}
                            className="self-start sm:self-end"
                          />
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-ink-mute shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-ink-mute shrink-0" />
                        )}
                      </div>
                    </div>

                    {entry.description && (
                      <p className="mt-2 text-sm text-ink-mute line-clamp-1">{entry.description}</p>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t px-4 py-4 bg-canvas-sunken/30">
                      <JournalCardLines entryId={entry.id} />
                      
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t sm:flex sm:flex-wrap">
                        {entry.status === 'DRAFT' && (
                          <>
                            <TajMallPdfToolbar
                              fileName={`قيد-يومية-${entry.number}`}
                              className="col-span-2 sm:col-span-1"
                              render={async () => {
                                const [{ JournalPDF }] = await Promise.all([
                                  import('@/features/pdf/JournalPDF'),
                                ]);
                                const singleEntry = await buildJournalEntriesForPdf([entry]);

                                return (
                                  <JournalPDF
                                    entries={singleEntry}
                                    periodLabel={`القيد رقم ${entry.number}`}
                                  />
                                );
                              }}
                            />
                            {can('journal.create') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateEntry.mutate(entry.id, {
                                    onSuccess: () => setExpandedId(null),
                                  });
                                }}
                                disabled={duplicateEntry.isPending}
                                className="gap-1.5 h-11 touch-manipulation"
                              >
                                {duplicateEntry.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                                نسخ
                              </Button>
                            )}
                            {can('journal.post') && (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmAction({
                                  type: 'post',
                                  entryId: entry.id,
                                  entryNumber: entry.number,
                                });
                              }}
                              disabled={!isBalanced || postEntry.isPending}
                              className="gap-1.5 h-11 col-span-2 sm:col-span-1 touch-manipulation"
                            >
                              {postEntry.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              ترحيل
                            </Button>
                            )}
                            {can('journal.create') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingEntry(entry);
                              }}
                              className="gap-1.5 h-11 touch-manipulation"
                            >
                              <FileText className="h-4 w-4" />
                              تعديل
                            </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEntry(entry);
                              }}
                              className="gap-1.5 h-11 touch-manipulation"
                            >
                              <FileText className="h-4 w-4" />
                              التفاصيل
                            </Button>
                            {can('journal.create') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmAction({
                                  type: 'delete',
                                  entryId: entry.id,
                                  entryNumber: entry.number,
                                });
                              }}
                              disabled={deleteEntry.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5 h-11 col-span-2 sm:col-span-1 touch-manipulation"
                            >
                              {deleteEntry.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              حذف
                            </Button>
                            )}
                          </>
                        )}
                        {entry.status === 'POSTED' && (
                          <>
                            <TajMallPdfToolbar
                              fileName={`قيد-يومية-${entry.number}`}
                              className="col-span-2 sm:col-span-1"
                              render={async () => {
                                const [{ JournalPDF }] = await Promise.all([
                                  import('@/features/pdf/JournalPDF'),
                                ]);
                                const singleEntry = await buildJournalEntriesForPdf([entry]);

                                return (
                                  <JournalPDF
                                    entries={singleEntry}
                                    periodLabel={`القيد رقم ${entry.number}`}
                                  />
                                );
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEntry(entry);
                              }}
                              className="gap-1.5 h-11 touch-manipulation"
                            >
                              <FileText className="h-4 w-4" />
                              التفاصيل
                            </Button>
                            {can('journal.reverse') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmAction({
                                  type: 'reverse',
                                  entryId: entry.id,
                                  entryNumber: entry.number,
                                });
                              }}
                              disabled={reverseEntry.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5 h-11 touch-manipulation"
                            >
                              {reverseEntry.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              عكس القيد
                            </Button>
                            )}
                          </>
                        )}
                        {entry.status === 'REVERSED' && (
                          <>
                            <TajMallPdfToolbar
                              fileName={`قيد-يومية-${entry.number}`}
                              className="col-span-2 sm:col-span-1"
                              render={async () => {
                                const [{ JournalPDF }] = await Promise.all([
                                  import('@/features/pdf/JournalPDF'),
                                ]);
                                const singleEntry = await buildJournalEntriesForPdf([entry]);

                                return (
                                  <JournalPDF
                                    entries={singleEntry}
                                    periodLabel={`القيد رقم ${entry.number}`}
                                  />
                                );
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEntry(entry);
                              }}
                              className="gap-1.5 h-11 w-full sm:w-auto touch-manipulation"
                            >
                              <FileText className="h-4 w-4" />
                              التفاصيل
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <JournalEntryDialog
        open={isCreateOpen || !!editingEntry}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingEntry(null);
        }}
        editingEntry={editingEntry}
      />

      {/* Detail Dialog */}
      {selectedEntry && (
        <JournalDetailDialog
          entry={selectedEntry}
          open={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {can('journal.create') && (
        <Button
          size="lg"
          onClick={() => setIsCreateOpen(true)}
          className="fixed z-40 h-14 w-14 rounded-full shadow-lg bg-sage-700 hover:bg-sage-800 text-white sm:hidden p-0 touch-manipulation left-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]"
          aria-label="قيد جديد"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      {confirmAction && (
        <JournalConfirmSheet
          open
          title={confirmCopy[confirmAction.type].title}
          description={`قيد #${confirmAction.entryNumber}. ${confirmCopy[confirmAction.type].description}`}
          confirmLabel={confirmCopy[confirmAction.type].confirmLabel}
          variant={confirmCopy[confirmAction.type].variant}
          loading={
            postEntry.isPending || reverseEntry.isPending || deleteEntry.isPending
          }
          onConfirm={runConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}

// ── Subcomponent: Inline Journal Lines Display (classic voucher) ──
function JournalCardLines({ entryId }: { entryId: string }) {
  const { data: lines = [], isLoading } = useJournalLines(entryId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <JournalVoucherTable
      density="compact"
      lines={lines.map(mapJournalLineRowToVoucherLine)}
    />
  );
}
