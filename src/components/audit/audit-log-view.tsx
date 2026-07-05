'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  useAuditLogFeed,
  type AuditAction,
  type AuditLogRow,
} from '@/lib/db/audit-queries';
import { SYSTEM_ROLES } from '@/lib/constants';
import { getAuditEntityLink } from '@/lib/audit-navigation';
import { cn, formatDate, formatMoney, formatDateRelative } from '@/lib/utils';

const ENTITY_FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'transaction', label: 'معاملات' },
  { value: 'disbursement_voucher', label: 'صرف' },
  { value: 'tenant_charge', label: 'مطالبات' },
  { value: 'journal_entry', label: 'قيود' },
  { value: 'cashbox', label: 'خزائن' },
  { value: 'cash_transfer', label: 'تحويلات' },
] as const;

const ACTION_FILTERS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'INSERT', label: 'إضافة' },
  { value: 'UPDATE', label: 'تعديل' },
  { value: 'DELETE', label: 'حذف' },
] as const;

type ActionFilter = (typeof ACTION_FILTERS)[number]['value'];

const ROLE_AR = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.name, r.nameAr])) as Record<string, string>;

function roleLabel(role: string | null | undefined) {
  if (!role) return '';
  return ROLE_AR[role.toLowerCase()] ?? role;
}

function ActionIcon({ action }: { action: AuditAction }) {
  if (action === 'INSERT') return <Plus className="h-4 w-4" aria-hidden />;
  if (action === 'UPDATE') return <Pencil className="h-4 w-4" aria-hidden />;
  return <Trash2 className="h-4 w-4" aria-hidden />;
}

function metaDetail(row: AuditLogRow): string | null {
  const m = row.metadata;
  if (!m || typeof m !== 'object') return null;
  const parts: string[] = [];
  if (typeof m.cashbox === 'string' && m.cashbox) parts.push(m.cashbox);
  if (typeof m.category === 'string' && m.category) parts.push(m.category);
  if (typeof m.kind === 'string' && m.kind) {
    parts.push(m.kind === 'REVENUE' ? 'إيراد' : m.kind === 'EXPENSE' ? 'مصروف' : String(m.kind));
  }
  return parts.length ? parts.join(' · ') : null;
}

function AuditRowCard({ row }: { row: AuditLogRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const link = getAuditEntityLink(row);
  const isDelete = row.action === 'DELETE';
  const isInsert = row.action === 'INSERT';
  const delta = row.amount_delta ?? 0;
  const hasDelta = row.amount_delta != null && row.amount_delta !== 0;
  const subtitle = metaDetail(row);

  function openSource() {
    if (!link) return;
    router.push(link.href);
  }

  return (
    <article
      className={cn(
        'surface overflow-hidden transition-shadow',
        link && 'hover:shadow-whisper',
        isDelete && 'border-s-2 border-s-red-500/70',
      )}
    >
      <div
        role={link ? 'button' : undefined}
        tabIndex={link ? 0 : undefined}
        onClick={() => link && openSource()}
        onKeyDown={(e) => {
          if (!link) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSource();
          }
        }}
        className={cn(
          'flex w-full flex-col text-start touch-manipulation',
          link && 'cursor-pointer active:bg-canvas-sunken/40',
        )}
      >
        <div className="flex items-start gap-3 p-4">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              isDelete && 'bg-red-50 text-red-700',
              isInsert && !isDelete && 'bg-emerald-50 text-emerald-800',
              !isDelete && !isInsert && 'bg-canvas-sunken text-foreground',
            )}
          >
            <ActionIcon action={row.action} />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  isDelete
                    ? 'bg-red-100 text-red-800'
                    : isInsert
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-secondary text-secondary-foreground',
                )}
              >
                {AUDIT_ACTION_LABELS[row.action]}
              </span>
              <span className="text-[10px] text-ink-mute">
                {AUDIT_ENTITY_LABELS[row.entity_type] ?? row.entity_type}
              </span>
              {isDelete && (
                <span className="text-[10px] font-medium text-red-600">محذوف</span>
              )}
            </div>

            <p className="text-sm font-medium leading-snug text-foreground">{row.summary_ar}</p>

            {subtitle && (
              <p className="line-clamp-1 text-xs text-ink-mute">{subtitle}</p>
            )}

            <p className="text-xs text-ink-mute">
              {row.actor_name_ar ?? 'النظام'}
              {row.actor_role ? ` · ${roleLabel(row.actor_role)}` : ''}
              <span className="mx-1.5 text-border">·</span>
              {formatDateRelative(row.created_at)}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {hasDelta && (
              <p
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  delta > 0 ? 'text-emerald-700' : 'text-red-700',
                )}
              >
                {delta > 0 ? '+' : ''}
                {formatMoney(delta, 'LYD', { compact: true })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-canvas-sunken/50 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-ink-mute">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            الرصيد بعد الحركة
          </span>
          <strong className="text-sm font-semibold tabular-nums text-foreground">
            {formatMoney(row.balance_total_after ?? 0, 'LYD', { compact: true })}
          </strong>
        </div>

        {link && (
          <p className="flex items-center justify-end gap-1 border-t border-border/60 px-4 py-2 text-[11px] font-medium text-sage-800">
            {link.label}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-[11px] text-ink-mute touch-manipulation hover:bg-canvas-sunken/50"
        aria-expanded={open}
      >
        {open ? (
          <>
            إخفاء التفاصيل
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </>
        ) : (
          <>
            تفاصيل إضافية
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border px-4 py-3 text-xs">
          {row.business_date && (
            <p>
              <span className="text-ink-mute">تاريخ العملية: </span>
              <span className="text-foreground">{formatDate(row.business_date)}</span>
            </p>
          )}
          <p>
            <span className="text-ink-mute">وقت التسجيل: </span>
            <span className="text-foreground">{formatDate(row.created_at)}</span>
          </p>
          {row.cashbox_balance_after != null && (
            <p>
              <span className="text-ink-mute">رصيد الخزينة: </span>
              <strong className="tabular-nums text-foreground">
                {formatMoney(row.cashbox_balance_after)}
              </strong>
            </p>
          )}
          {row.entity_label_ar && (
            <p className="line-clamp-2 text-foreground">{row.entity_label_ar}</p>
          )}
          {isDelete && (
            <p className="text-ink-mute">
              الرصيد المعروض يعكس الوضع مباشرة بعد الحذف.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium touch-manipulation transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-canvas-sunken text-ink-mute hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function AuditLogView() {
  const [entityType, setEntityType] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 40;

  const { data, isLoading, isError, refetch, isFetching } = useAuditLogFeed({
    limit,
    offset,
    entityType: entityType || null,
    fromDate: fromDate || null,
    toDate: toDate || null,
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;
  const hasMore = offset + limit < total;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (actionFilter !== 'ALL' && row.action !== actionFilter) return false;
      if (!q) return true;
      return (
        row.summary_ar.toLowerCase().includes(q) ||
        (row.actor_name_ar?.toLowerCase().includes(q) ?? false) ||
        (row.entity_label_ar?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, actionFilter, search]);

  const latestBalance = rows[0]?.balance_total_after;
  const deleteCount = filtered.filter((r) => r.action === 'DELETE').length;

  return (
    <div className="flex flex-col gap-5 pb-24 md:pb-10">
      {!isLoading && latestBalance != null && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="surface col-span-2 flex items-center justify-between gap-3 p-4 sm:col-span-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
                آخر رصيد
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {formatMoney(latestBalance, 'LYD', { compact: true })}
              </p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-canvas-sunken text-sage-700">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
          </div>
          <div className="surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
              السجلات
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">{total}</p>
          </div>
          <div className="surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute">
              حذف (الصفحة)
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
              {deleteCount}
            </p>
          </div>
        </div>
      )}

      <section className="surface flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث…"
              className="h-10 border-0 bg-canvas-sunken pr-9 shadow-none focus-visible:ring-1"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-border"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="تحديث"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium text-ink-mute">النوع</p>
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-1.5">
              {ENTITY_FILTERS.map((f) => (
                <FilterChip
                  key={f.value || 'all'}
                  active={entityType === f.value}
                  onClick={() => {
                    setEntityType(f.value);
                    setOffset(0);
                  }}
                >
                  {f.label}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-medium text-ink-mute">العملية</p>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                active={actionFilter === f.value}
                onClick={() => setActionFilter(f.value)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs md:hidden"
            onClick={() => setShowDates((v) => !v)}
          >
            <Filter className="h-3.5 w-3.5" />
            التاريخ
          </Button>
          {!isLoading && (
            <p className="text-xs text-ink-mute">
              {filtered.length} معروض من {total}
            </p>
          )}
        </div>

        <div
          className={cn(
            'grid grid-cols-2 gap-2',
            !showDates && 'hidden md:grid',
          )}
        >
          <Input
            type="date"
            aria-label="من تاريخ"
            className="h-9 bg-canvas-sunken text-xs"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setOffset(0);
            }}
          />
          <Input
            type="date"
            aria-label="إلى تاريخ"
            className="h-9 bg-canvas-sunken text-xs"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </section>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-canvas-sunken" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          تعذّر تحميل السجل. تأكد من تطبيق هجرة 020.
        </p>
      ) : filtered.length === 0 ? (
        <div className="surface flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm font-medium">لا توجد سجلات</p>
          <p className="text-xs text-ink-mute">جرّب تغيير الفلاتر أو البحث.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((row) => (
            <li key={row.id}>
              <AuditRowCard row={row} />
            </li>
          ))}
        </ul>
      )}

      {(offset > 0 || hasMore) && !isLoading && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {offset > 0 && (
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              disabled={isFetching}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
            >
              السابق
            </Button>
          )}
          {hasMore && (
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={isFetching}
              onClick={() => setOffset((o) => o + limit)}
            >
              {isFetching ? 'جاري التحميل…' : 'تحميل المزيد'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
