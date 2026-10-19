'use client';

import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { WriteGuard } from '@/components/auth/write-guard';
import { LandlordDuesPanel } from '@/components/contacts/landlord-dues-panel';
import { DirectoryTable } from '@/components/contacts/directory/directory-table';
import { DirectoryCard, DirectoryTableRow } from '@/components/contacts/directory/directory-row';
import { DirectoryEmpty, DirectoryError, DirectoryNoMatch, DirectorySkeleton } from '@/components/contacts/directory/directory-states';
import { DirectorySummaryStrip } from '@/components/contacts/directory/directory-summary';
import { DirectoryToolbar, RoleChips } from '@/components/contacts/directory/directory-toolbar';
import { LandlordHints } from '@/components/contacts/directory/landlord-hints';
import type { RowContext } from '@/components/contacts/directory/directory-types';
import type { ContactsDirectoryState } from '@/components/contacts/use-contacts-directory';
import { roleChipsFor, type DirectoryRow, type RoleFilter } from '@/lib/contacts/directory';
import { landlordMonthName } from '@/lib/contacts/contact-roles';
import { last12MonthKeys } from '@/lib/people/party-stats';
import type { PeopleSegment } from '@/lib/mall/routes';
import { useCategories } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';
import { arabicCount, todayISODate } from '@/lib/utils';

const FILES: [string, string, string, string] = ['جهة واحدة', 'جهتان', 'جهات', 'جهة'];

const COPY: Record<PeopleSegment, { empty: string; add: string; table: string; search: string; placeholder: string }> = {
  all: { empty: 'لا توجد جهات بعد.', add: 'إضافة جهة', table: 'الدليل الشامل', search: 'بحث في الدليل', placeholder: 'الاسم أو الهاتف أو رقم المحل' },
  TENANT: { empty: 'لا يوجد مستأجرون بعد.', add: 'إضافة مستأجر', table: 'المستأجرون', search: 'بحث في المستأجرين', placeholder: 'الاسم أو الهاتف أو رقم المحل' },
  EMPLOYEE: { empty: 'لا يوجد موظفون بعد.', add: 'إضافة موظف', table: 'الموظفون', search: 'بحث في الموظفين', placeholder: 'الاسم أو الهاتف أو الرمز' },
  VENDOR: { empty: 'لا يوجد موردون بعد.', add: 'إضافة مورد', table: 'الموردون', search: 'بحث في الموردين', placeholder: 'الاسم أو الهاتف أو الرمز' },
  CUSTOMER: { empty: 'لا يوجد عملاء بعد.', add: 'إضافة عميل', table: 'العملاء والمؤجرون', search: 'بحث في العملاء والمؤجرين', placeholder: 'الاسم أو الهاتف أو الرمز' },
};

export const ADD_LABEL: Record<PeopleSegment, string> = {
  all: COPY.all.add,
  TENANT: COPY.TENANT.add,
  EMPLOYEE: COPY.EMPLOYEE.add,
  VENDOR: COPY.VENDOR.add,
  CUSTOMER: COPY.CUSTOMER.add,
};

export type ContactsDirectoryProps = {
  directory: ContactsDirectoryState;
  segment: PeopleSegment;
  /** the role filter, from the address bar */
  role: RoleFilter;
  onRoleChange: (role: RoleFilter) => void;
};

/**
 * The people of one list: figures for the list, the role filters, the search, and the rows as a table on a
 * wide screen or cards below it. What the person types lives in `directory`; the role lives in the address.
 */
export function ContactsDirectory({ directory: d, segment, role, onRoleChange }: ContactsDirectoryProps) {
  const perm = usePermission();
  const canExpense = perm.can('expense.create');
  const canRevenue = perm.can('revenue.create');
  const openVoucher = useTxDialog((s) => s.open);
  const { data: categories } = useCategories();
  const rentCategoryId = categories?.find((c) => c.code === 'EXP-RNT')?.id;
  const copy = COPY[segment];

  const monthLabels = useMemo(() => last12MonthKeys(todayISODate()).map((k) => landlordMonthName(Number(k.slice(5, 7)))), []);
  const hintIds = useMemo(() => new Set(d.hints.map((r) => r.contact.id)), [d.hints]);

  const canVoucher = useCallback((direction: 'in' | 'out') => (direction === 'out' ? canExpense : canRevenue), [canExpense, canRevenue]);
  const onVoucher = useCallback(
    (row: DirectoryRow) =>
      openVoucher({
        kind: row.direction === 'out' ? 'EXPENSE' : 'REVENUE',
        contactId: row.contact.id,
        contactKind: row.contact.kind,
        // rent paid to a landlord opens on the rent account
        categoryId: row.landlord && row.direction === 'out' ? rentCategoryId : undefined,
      }),
    [openVoucher, rentCategoryId],
  );

  const mayMutate = d.canWrite;
  const { activityState, startEdit, handleDelete } = d;
  const ctx: RowContext = useMemo(
    () => ({ activityState, monthLabels, canVoucher, onVoucher, mayMutate, onEdit: startEdit, onDelete: handleDelete, hintIds }),
    [activityState, monthLabels, canVoucher, onVoucher, mayMutate, startEdit, handleDelete, hintIds],
  );

  const chips = roleChipsFor(segment);
  // what is owed to landlords sits above their files when that role is the one being looked at
  const showLandlordDues = role === 'LANDLORD' && (segment === 'CUSTOMER' || segment === 'all');
  const filtering = d.searchQuery.trim() !== '' || role !== 'ALL';
  const onlyInactiveLeft = d.rows.length === 0 && !filtering && !d.showInactive && d.inactiveCount > 0;

  if (d.loadFailed) return <DirectoryError onRetry={d.retryContacts} />;

  const clearFilters = () => {
    d.setSearchQuery('');
    onRoleChange('ALL');
  };

  return (
    <div className="space-y-5">
      <DirectorySummaryStrip
        segment={segment}
        summary={d.summary}
        groups={d.groupSummaries}
        loading={d.isLoading}
        activityState={d.activityState}
        onRetryActivity={d.retryActivity}
      />

      {!d.isLoading && segment !== 'TENANT' && (
        <LandlordHints hints={d.hints} canWrite={d.canWrite} approving={d.approving} onApprove={() => void d.approveHints()} onDismiss={d.dismissHints} />
      )}

      <div className="space-y-3">
        <DirectoryToolbar
          searchQuery={d.searchQuery}
          onSearchChange={d.setSearchQuery}
          sort={d.sort}
          onSortChange={d.setSort}
          showInactive={d.showInactive}
          onShowInactiveChange={d.setShowInactive}
          inactiveCount={d.inactiveCount}
          searchLabel={copy.search}
          placeholder={copy.placeholder}
        />
        <RoleChips chips={chips} counts={d.roleCounts} value={role} onChange={onRoleChange} />
      </div>

      {showLandlordDues && (
        <div className="space-y-3">
          <LandlordDuesPanel />
          <h2 className="px-1 pt-2 text-[15px] font-semibold text-foreground">ملفات المؤجرين</h2>
        </div>
      )}

      {d.isLoading ? (
        <DirectorySkeleton />
      ) : d.segmentRows.length === 0 ? (
        <DirectoryEmpty
          action={
            <WriteGuard permission="document.create">
              <Button type="button" className="min-h-11 sm:min-h-9" onClick={() => d.openAdd()}>
                {copy.add}
              </Button>
            </WriteGuard>
          }
        >
          {copy.empty}
        </DirectoryEmpty>
      ) : onlyInactiveLeft ? (
        <DirectoryEmpty
          action={
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => d.setShowInactive(true)}>
              إظهار غير النشطين
            </Button>
          }
        >
          لا توجد ملفات نشطة في هذه القائمة.
        </DirectoryEmpty>
      ) : d.rows.length === 0 ? (
        <DirectoryNoMatch onClear={clearFilters} searching={d.searchQuery.trim() !== ''} />
      ) : (
        <section aria-label={copy.table} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[12.5px] text-ink-mute">
            <p aria-live="polite">{arabicCount(d.rows.length, FILES)}</p>
            {d.activityState === 'error' && (
              <p className="flex items-center gap-1 text-danger-ink">
                تعذّر تحميل الحركات
                <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 text-danger-ink sm:min-h-8" onClick={d.retryActivity}>
                  إعادة المحاولة
                </Button>
              </p>
            )}
          </div>

          <DirectoryTable sort={d.sort} onSort={d.setSort} label={copy.table}>
            {d.visibleRows.map((row) => (
              <DirectoryTableRow key={row.contact.id} row={row} ctx={ctx} />
            ))}
          </DirectoryTable>

          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:hidden" aria-label={copy.table}>
            {d.visibleRows.map((row) => (
              <li key={row.contact.id}>
                <DirectoryCard row={row} ctx={ctx} />
              </li>
            ))}
          </ul>

          {d.hasMore && (
            <div className="flex justify-center pt-1">
              <Button type="button" variant="outline" className="h-11 min-w-48 sm:h-9" onClick={d.showMore}>
                عرض المزيد ({d.remaining})
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
