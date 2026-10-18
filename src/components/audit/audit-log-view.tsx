'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Filter, Pencil, Plus, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
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
import { matchesSearch } from '@/lib/arabic-search';
import { cn, formatDate, formatMoney } from '@/lib/utils';

const ENTITY_FILTERS = [
  { value: '', label: 'الكل' },
  { value: 'transaction', label: 'معاملات' },
  { value: 'disbursement_voucher', label: 'إذونات صرف' },
  { value: 'tenant_charge', label: 'مطالبات' },
  { value: 'journal_entry', label: 'قيود' },
  { value: 'cashbox', label: 'خزائن' },
  { value: 'cash_transfer', label: 'تحويلات' },
] as const;

const ACTION_FILTERS = [
  { value: 'ALL', label: 'كل العمليات' },
  { value: 'INSERT', label: 'إضافة' },
  { value: 'UPDATE', label: 'تعديل' },
  { value: 'DELETE', label: 'حذف' },
] as const;

type ActionFilter = (typeof ACTION_FILTERS)[number]['value'];

const ROLE_AR = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.name, r.nameAr])) as Record<string, string>;
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const ACTION_STYLE: Record<AuditAction, { icon: typeof Plus; tile: string; ink: string }> = {
  INSERT: { icon: Plus, tile: 'bg-success-soft text-success-ink', ink: 'text-success-ink' },
  UPDATE: { icon: Pencil, tile: 'bg-info-soft text-info-ink', ink: 'text-info-ink' },
  DELETE: { icon: Trash2, tile: 'bg-danger-soft text-danger-ink', ink: 'text-danger-ink' },
};

function roleLabel(role: string | null | undefined) {
  if (!role) return '';
  return ROLE_AR[role.toLowerCase()] ?? role;
}

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dayLabel(key: string) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const long = `${WEEKDAYS[date.getDay()]} ${formatDate(date)}`;
  if (key === localDayKey(today)) return { title: 'اليوم', sub: long };
  if (key === localDayKey(yesterday)) return { title: 'أمس', sub: long };
  return { title: long, sub: null };
}

function metaDetail(row: AuditLogRow): string[] {
  const m = row.metadata;
  if (!m || typeof m !== 'object') return [];
  const parts: string[] = [];
  if (typeof m.kind === 'string' && m.kind) parts.push(m.kind === 'REVENUE' ? 'إيراد' : m.kind === 'EXPENSE' ? 'مصروف' : String(m.kind));
  if (typeof m.category === 'string' && m.category) parts.push(m.category);
  if (typeof m.cashbox === 'string' && m.cashbox) parts.push(m.cashbox);
  return parts;
}

function AuditRow({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const link = getAuditEntityLink(row);
  const style = ACTION_STYLE[row.action];
  const Icon = style.icon;
  const delta = row.amount_delta ?? 0;
  const hasDelta = row.amount_delta != null && Math.abs(delta) > 0.0005;
  const meta = metaDetail(row);
  const created = new Date(row.created_at);
  const detailsId = `audit-${row.id}`;

  return (
    <li className={cn(row.action === 'DELETE' && 'bg-danger-soft/25')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailsId}
        className="grid w-full grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto_1rem] px-3 py-2.5 text-start touch-manipulation hover:bg-canvas-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4"
      >
        <span className={cn('row-span-2 grid h-8 w-8 place-items-center self-start rounded-lg sm:row-span-1', style.tile)} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <span className="col-start-2 row-start-1 min-w-0">
          <span className="block text-[13.5px] font-medium leading-snug text-foreground">{row.summary_ar}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-mute">
            <span className={cn('font-medium', style.ink)}>{AUDIT_ACTION_LABELS[row.action]}</span>
            <span aria-hidden>·</span>
            <span>{AUDIT_ENTITY_LABELS[row.entity_type] ?? row.entity_type}</span>
            <span aria-hidden>·</span>
            <span>
              {row.actor_name_ar ?? 'النظام'}
              {row.actor_role ? ` (${roleLabel(row.actor_role)})` : ''}
            </span>
            <span aria-hidden>·</span>
            <time dateTime={row.created_at} className="tabular-nums">
              {timeFmt.format(created)}
            </time>
          </span>
        </span>
        <span className="col-start-2 row-start-2 mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:flex-col sm:items-end sm:text-end">
          {hasDelta ? (
            <span className={cn('text-[13.5px] font-semibold tabular-nums', delta > 0 ? 'text-success-ink' : 'text-danger-ink')}>
              {formatMoney(delta, 'LYD', { signed: true })}
            </span>
          ) : (
            <span className="text-[12px] text-ink-mute">بلا أثر نقدي</span>
          )}
          {row.balance_total_after != null && (
            <span className="text-[11.5px] text-ink-mute tabular-nums">
              الرصيد {formatMoney(row.balance_total_after, 'LYD')}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'col-start-3 row-span-2 row-start-1 h-4 w-4 text-ink-mute transition-transform sm:col-start-4 sm:row-span-1',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div id={detailsId} className="border-t border-border/70 bg-canvas-sunken/40 px-3 py-3 sm:ps-15 sm:pe-4">
          <dl className="grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:justify-start">
              <dt className="text-ink-mute">وقت التسجيل</dt>
              <dd className="tabular-nums text-foreground">
                {formatDate(created)} {timeFmt.format(created)}
              </dd>
            </div>
            {row.business_date && (
              <div className="flex justify-between gap-3 sm:justify-start">
                <dt className="text-ink-mute">تاريخ العملية</dt>
                <dd className="text-foreground">{formatDate(row.business_date)}</dd>
              </div>
            )}
            {meta.length > 0 && (
              <div className="flex justify-between gap-3 sm:justify-start">
                <dt className="text-ink-mute">التفاصيل</dt>
                <dd className="text-foreground">{meta.join(' · ')}</dd>
              </div>
            )}
            {row.cashbox_balance_after != null && (
              <div className="flex justify-between gap-3 sm:justify-start">
                <dt className="text-ink-mute">رصيد الخزينة بعدها</dt>
                <dd className="font-medium tabular-nums text-foreground">{formatMoney(row.cashbox_balance_after, 'LYD')}</dd>
              </div>
            )}
            {row.balance_total_after != null && (
              <div className="flex justify-between gap-3 sm:justify-start">
                <dt className="text-ink-mute">رصيد كل الخزائن بعدها</dt>
                <dd className="font-medium tabular-nums text-foreground">{formatMoney(row.balance_total_after, 'LYD')}</dd>
              </div>
            )}
            {row.entity_label_ar && row.entity_label_ar !== row.summary_ar && (
              <div className="flex justify-between gap-3 sm:col-span-2 sm:justify-start">
                <dt className="shrink-0 text-ink-mute">السجل</dt>
                <dd className="text-foreground">{row.entity_label_ar}</dd>
              </div>
            )}
          </dl>
          {row.action === 'DELETE' && (
            <p className="mt-2 text-[12px] text-danger-ink">سجل محذوف — الرصيد المعروض هو الوضع مباشرة بعد الحذف.</p>
          )}
          {link && (
            <Button asChild size="sm" variant="outline" className="mt-2.5 h-8 gap-1.5 bg-card text-[12.5px]">
              <Link href={link.href}>
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium touch-manipulation transition-colors',
        active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-ink-mute hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The audit trail: every change with who made it, when, its effect on cash and the balance right after.
 * Grouped by day, one compact line per change; details open in place.
 */
export function AuditLogView() {
  const [entityType, setEntityType] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

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

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (actionFilter === 'ALL' || row.action === actionFilter) &&
          matchesSearch(search, [row.summary_ar, row.actor_name_ar, row.entity_label_ar, ...metaDetail(row)]),
      ),
    [rows, actionFilter, search],
  );

  const days = useMemo(() => {
    // One section per day, newest first, whatever order the rows arrive in.
    const byDay = new Map<string, AuditLogRow[]>();
    for (const row of filtered) {
      const key = localDayKey(new Date(row.created_at));
      byDay.set(key, [...(byDay.get(key) ?? []), row]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, dayRows]) => ({ key, rows: dayRows.sort((a, b) => b.created_at.localeCompare(a.created_at)) }));
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<AuditAction, number> = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    for (const r of filtered) c[r.action] += 1;
    return c;
  }, [filtered]);
  const latestBalance = offset === 0 ? rows[0]?.balance_total_after : null;

  return (
    <div className="flex flex-col gap-4 pb-24 md:pb-10">
      <section className="surface flex flex-col gap-3 p-3 sm:p-4" aria-label="تصفية السجل">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في البيان أو المستخدم أو الخزينة…"
              aria-label="بحث في السجل"
              className="h-10 ps-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="تحديث"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 gap-1.5 px-3 md:hidden"
            onClick={() => setShowDates((v) => !v)}
            aria-expanded={showDates}
          >
            <Filter className="h-4 w-4" aria-hidden />
            التاريخ
          </Button>
        </div>

        <div className="-mx-1 overflow-x-auto px-1 no-scrollbar" role="group" aria-label="نوع السجل">
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

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="العملية">
            {ACTION_FILTERS.map((f) => (
              <FilterChip key={f.value} active={actionFilter === f.value} onClick={() => setActionFilter(f.value)}>
                {f.label}
              </FilterChip>
            ))}
          </div>
          <div className={cn('grid grid-cols-2 gap-2 md:flex md:items-center', !showDates && 'hidden md:flex')}>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-mute">
              من
              <Input
                type="date"
                className="h-9 w-full md:w-40"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-mute">
              إلى
              <Input
                type="date"
                className="h-9 w-full md:w-40"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setOffset(0);
                }}
              />
            </label>
          </div>
        </div>
      </section>

      {!isLoading && !isError && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[12.5px] text-ink-mute">
          <p>
            {filtered.length === rows.length ? (
              <>
                <span className="tabular-nums text-foreground">{total}</span> سجل
                {total > rows.length && (
                  <>
                    {' '}· المعروض <span className="tabular-nums">{offset + 1}–{offset + rows.length}</span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="tabular-nums text-foreground">{filtered.length}</span> مطابق من {rows.length} في هذه الصفحة
              </>
            )}
            {' · '}إضافة {counts.INSERT} · تعديل {counts.UPDATE} ·{' '}
            <span className={cn(counts.DELETE > 0 && 'font-medium text-danger-ink')}>حذف {counts.DELETE}</span>
          </p>
          {latestBalance != null && (
            <p className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              رصيد الخزائن بعد آخر حركة{' '}
              <span className="font-semibold tabular-nums text-foreground">{formatMoney(latestBalance, 'LYD')}</span>
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="surface divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="surface flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm font-medium text-danger-ink">تعذّر تحميل السجل.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface flex flex-col items-center gap-1 py-14 text-center">
          <p className="text-sm font-medium">لا توجد سجلات</p>
          <p className="text-[12.5px] text-ink-mute">
            {rows.length > 0 ? 'لا شيء يطابق البحث أو العملية في هذه الصفحة.' : 'جرّب نوعاً أو فترة أخرى.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => {
            const label = dayLabel(day.key);
            return (
              <section key={day.key} aria-labelledby={`day-${day.key}`}>
                <h3
                  id={`day-${day.key}`}
                  className="sticky top-16 z-10 -mx-1 mb-1.5 flex items-baseline gap-2 bg-canvas/95 px-1 py-1.5 backdrop-blur-sm"
                >
                  <span className="text-[14px] font-semibold text-foreground">{label.title}</span>
                  {label.sub && <span className="text-[12.5px] text-ink-mute">{label.sub}</span>}
                  <span className="ms-auto text-[12px] text-ink-mute tabular-nums">{day.rows.length} حركة</span>
                </h3>
                <ul className="surface divide-y divide-border overflow-hidden">
                  {day.rows.map((row) => (
                    <AuditRow key={row.id} row={row} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
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
              الأحدث
            </Button>
          )}
          {hasMore && (
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              disabled={isFetching}
              onClick={() => setOffset((o) => o + limit)}
            >
              {isFetching ? 'جارٍ التحميل…' : 'الأقدم'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
