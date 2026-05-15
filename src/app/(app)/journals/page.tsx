'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  BookOpen,
  Search,
  Loader2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Trash2,
  FileText,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  type JournalEntryRow,
  type JournalStatus,
} from '@/lib/db/journal-queries';
import { JournalEntryDialog } from './components/journal-entry-dialog';
import { JournalDetailDialog } from './components/journal-detail-dialog';
import { FluxenPdfToolbar } from '@/features/pdf/fluxen-pdf-toolbar';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<JournalStatus | 'ALL'>('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntryRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data: entries,
    isLoading: isLoadingEntries,
    isError: entriesQueryError,
    error: entriesQueryErr,
  } = useJournalEntries(statusFilter === 'ALL' ? undefined : statusFilter);
  const {
    data: summary,
    isError: summaryQueryError,
    error: summaryQueryErr,
  } = useJournalSummary();

  const postEntry = usePostJournalEntry();
  const reverseEntry = useReverseJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

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
        color: 'bg-blue-100 text-blue-600',
        isCurrency: true,
      },
    ];
  }, [summary]);

  const handlePost = async (id: string) => {
    if (!confirm('هل أنت متأكد من ترحيل هذا القيد؟ لا يمكن التراجع بعد الترحيل.')) return;
    await postEntry.mutateAsync(id);
  };

  const handleReverse = async (id: string) => {
    if (!confirm('هل أنت متأكد من عكس هذا القيد؟ سيتم إنشاء قيد معكوس جديد.')) return;
    await reverseEntry.mutateAsync(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا القيد؟ يمكن حذف المسودات فقط.')) return;
    await deleteEntry.mutateAsync(id);
  };

  return (
    <>
      <PageHeader
        eyebrow="القيود المحاسبية"
        title="دفتر اليومية"
        description="نظام القيود المزدوجة - المدين والدائن - مع الترحيل والعكس"
        actions={
          <>
            <FluxenPdfToolbar
              fileName={`دفتر-اليومية-${new Date().getFullYear()}`}
              render={async () => {
                const [{ JournalPDF }, { createSupabaseBrowserClient }] =
                  await Promise.all([
                    import('@/features/pdf/JournalPDF'),
                    import('@/lib/supabase/client'),
                  ]);
                const supabase = createSupabaseBrowserClient();

                type LineRow = {
                  debit: string;
                  credit: string;
                  description: string | null;
                  category_name: string | null;
                  category_code: string | null;
                  sort_order: number;
                };

                const pdfEntries = await Promise.all(
                  filteredEntries.map(async (e) => {
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

                return (
                  <JournalPDF
                    entries={pdfEntries}
                    periodLabel={`السنة المالية ${new Date().getFullYear()}`}
                  />
                );
              }}
            />
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              قيد جديد
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {(entriesQueryError || summaryQueryError) && (
          <Card className="border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-semibold">تعذّر تحميل بيانات دفتر اليومية</p>
            <p className="mt-2 text-red-800/90 leading-relaxed">
              {(entriesQueryErr as Error)?.message ??
                (summaryQueryErr as Error)?.message ??
                'غالباً الجداول أو الـ views غير مُنشأة في Supabase. طبّق هجرة journal (مثل 007_create_journal_tables) وتحقق من سياسات RLS.'}
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <Input
              placeholder="البحث برقم القيد أو الوصف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'px-3 py-2 text-sm rounded-md whitespace-nowrap flex items-center gap-1.5',
                statusFilter === 'ALL' ? 'bg-sage-700 text-white' : 'bg-canvas-sunken'
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
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'px-3 py-2 text-sm rounded-md whitespace-nowrap flex items-center gap-1.5',
                    statusFilter === status ? 'bg-sage-700 text-white' : 'bg-canvas-sunken'
                  )}
                >
                  <config.icon className="h-3.5 w-3.5" />
                  {config.label}
                </button>
              );
            })}
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
                <Card key={entry.id} className="overflow-hidden">
                  {/* Header */}
                  <div
                    className="p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => setIsExpanded(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                          status.bg, status.border
                        )}>
                          <StatusIcon className={cn('h-5 w-5', status.color)} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">قيد رقم {entry.number}</span>
                            <Badge variant="outline" className={cn('text-xs', status.bg, status.color)}>
                              {status.label}
                            </Badge>
                            {!isBalanced && entry.status === 'DRAFT' && (
                              <Badge variant="destructive" className="text-xs">
                                غير متوازن
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-ink-mute mt-0.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(entry.entry_date)}
                            {entry.reference && (
                              <>
                                <span>•</span>
                                <span>مرجع: {entry.reference}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <p className="text-sm font-medium">{formatMoney(Number(entry.total_debit), 'LYD')}</p>
                          <p className="text-xs text-ink-mute">
                            {entry.line_count} بنود
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-ink-mute" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-ink-mute" />
                        )}
                      </div>
                    </div>

                    {entry.description && (
                      <p className="mt-2 text-sm text-ink-mute line-clamp-1">{entry.description}</p>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-canvas-sunken/30">
                      <div className="flex flex-wrap gap-2">
                        {entry.status === 'DRAFT' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handlePost(entry.id)}
                              disabled={!isBalanced || postEntry.isPending}
                              className="gap-1.5"
                            >
                              {postEntry.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              ترحيل
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedEntry(entry)}
                              className="gap-1.5"
                            >
                              <FileText className="h-4 w-4" />
                              التفاصيل
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(entry.id)}
                              disabled={deleteEntry.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
                            >
                              {deleteEntry.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              حذف
                            </Button>
                          </>
                        )}
                        {entry.status === 'POSTED' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedEntry(entry)}
                              className="gap-1.5"
                            >
                              <FileText className="h-4 w-4" />
                              التفاصيل
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReverse(entry.id)}
                              disabled={reverseEntry.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
                            >
                              {reverseEntry.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              عكس القيد
                            </Button>
                          </>
                        )}
                        {entry.status === 'REVERSED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedEntry(entry)}
                            className="gap-1.5"
                          >
                            <FileText className="h-4 w-4" />
                            التفاصيل
                          </Button>
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

      {/* Create Dialog */}
      <JournalEntryDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      {/* Detail Dialog */}
      {selectedEntry && (
        <JournalDetailDialog
          entry={selectedEntry}
          open={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </>
  );
}
