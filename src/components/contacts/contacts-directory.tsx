'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Loader2,
  Building2,
  Building,
  Zap,
  Droplets,
  Package,
  Wrench,
  Briefcase,
  User,
  Store,
  Edit2,
  Trash2,
} from 'lucide-react';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import { useTxDialog } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import { usePartyActivity, type PartyActivity } from '@/lib/db/party-report-queries';
import {
  extractContactBusinessRole,
  visibleContactNotes,
  CONTACT_ROLES,
  type ContactBusinessRole,
} from '@/lib/contacts/contact-roles';

export type ContactsDirectoryProps = {
  contacts: ContactRow[];
  filteredContacts: ContactRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  roleFilter?: ContactBusinessRole | 'ALL';
  onRoleFilterChange?: (r: ContactBusinessRole | 'ALL') => void;
  kindFilter?: ContactKind | 'ALL';
  onKindFilterChange?: (k: ContactKind | 'ALL') => void;
  stats: {
    total: number;
    tenants: number;
    landlords: number;
    electricity: number;
    water: number;
    goods: number;
    services: number;
    employees: number;
    customers: number;
  };
  onAdd: (role?: ContactBusinessRole) => void;
  onEdit: (contact: ContactRow) => void;
  onDelete: (id: string) => void;
  hideKindFilters?: boolean;
  allowMutate?: boolean;
  showInactive?: boolean;
  onShowInactiveChange?: (show: boolean) => void;
  inactiveCount?: number;
};

const PAYABLE_ROLES: ContactBusinessRole[] = [
  'LANDLORD',
  'SUPPLIER_ELECTRICITY',
  'SUPPLIER_WATER',
  'SUPPLIER_GOODS',
  'SERVICE_PROVIDER',
  'EMPLOYEE',
];

const countAr = (n: number) => (n === 1 ? 'حركة واحدة' : n === 2 ? 'حركتان' : n <= 10 ? `${n} حركات` : `${n} حركة`);

function QuickTxButton({ contact, className }: { contact: ContactRow; className?: string }) {
  const open = useTxDialog((s) => s.open);
  const { can, loading } = usePermission();
  const role = extractContactBusinessRole(contact);
  const isPayable = PAYABLE_ROLES.includes(role);
  const kind = isPayable ? 'EXPENSE' : 'REVENUE';
  const perm = kind === 'REVENUE' ? 'revenue.create' : 'expense.create';

  if (loading || !can(perm) || !contact.is_active) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn('h-8 gap-1 px-2.5 text-[12.5px]', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open({ kind, contactId: contact.id, contactKind: contact.kind });
      }}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {role === 'LANDLORD' ? 'سداد إيجار' : isPayable ? 'سند صرف' : 'سند قبض'}
    </Button>
  );
}

/** What identifies this contact beyond the name: shop, meter, job, or where to reach them. */
function contactDetail(contact: ContactRow): string | null {
  const role = extractContactBusinessRole(contact);
  const rent = Number(contact.monthly_rent) > 0 ? `إيجار ${formatMoney(Number(contact.monthly_rent), 'LYD')} شهرياً` : null;
  if (role === 'LANDLORD') return [contact.shop_number ? `موقع ${contact.shop_number}` : 'عقار مؤجَّر للمول', rent].filter(Boolean).join(' · ');
  if (role === 'TENANT')
    return [`محل ${contact.shop_number || '—'}`, contact.floor && `الطابق ${contact.floor}`, rent].filter(Boolean).join(' · ');
  if (role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER')
    return [contact.shop_number && `عداد ${contact.shop_number}`, contact.department].filter(Boolean).join(' · ') || null;
  if (contact.job_title || contact.department) return [contact.job_title, contact.department].filter(Boolean).join(' · ');
  const notes = visibleContactNotes(contact.notes).split('\n')[0];
  return [contact.address, contact.email, notes].filter(Boolean).join(' · ') || null;
}

function ActivityCell({ contact, activity }: { contact: ContactRow; activity: PartyActivity | undefined }) {
  if (!activity || activity.count === 0) return <span className="text-ink-mute">لا حركات</span>;
  const payable = PAYABLE_ROLES.includes(extractContactBusinessRole(contact));
  const main = payable ? activity.expense : activity.revenue;
  const other = payable ? activity.revenue : activity.expense;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-semibold tabular-nums text-foreground">
        {payable ? 'مدفوع' : 'مقبوض'} {formatMoney(main, 'LYD')}
      </span>
      {other > 0 && (
        <span className="text-[12px] tabular-nums text-ink-mute">
          {payable ? 'مقبوض' : 'مدفوع'} {formatMoney(other, 'LYD')}
        </span>
      )}
      <span className="text-[12px] text-ink-mute">
        {countAr(activity.count)}
        {activity.lastDate && ` · آخرها ${formatDate(activity.lastDate)}`}
      </span>
    </span>
  );
}

export function ContactsDirectory({
  filteredContacts,
  isLoading,
  searchQuery,
  onSearchChange,
  roleFilter = 'ALL',
  onRoleFilterChange,
  stats,
  onEdit,
  onDelete,
  hideKindFilters = false,
  allowMutate = true,
  showInactive = false,
  onShowInactiveChange,
  inactiveCount = 0,
}: ContactsDirectoryProps) {
  const router = useRouter();
  const { canWrite } = usePermission();
  const { data: activity } = usePartyActivity();
  const mayMutate = allowMutate && canWrite;

  const filterTabs: Array<{ id: ContactBusinessRole | 'ALL'; label: string; count: number; icon: typeof User }> = [
    { id: 'ALL', label: 'الكل', count: stats.total, icon: Store },
    { id: 'TENANT', label: 'مستأجرو المحلات', count: stats.tenants, icon: Building2 },
    { id: 'LANDLORD', label: 'مؤجرون للمول', count: stats.landlords, icon: Building },
    { id: 'SUPPLIER_ELECTRICITY', label: 'كهرباء وطاقة', count: stats.electricity, icon: Zap },
    { id: 'SUPPLIER_WATER', label: 'مياه وصرف', count: stats.water, icon: Droplets },
    { id: 'SUPPLIER_GOODS', label: 'بضائع ومواد', count: stats.goods, icon: Package },
    { id: 'SERVICE_PROVIDER', label: 'خدمات ومقاولات', count: stats.services, icon: Wrench },
    { id: 'EMPLOYEE', label: 'الموظفون', count: stats.employees, icon: Briefcase },
    { id: 'CUSTOMER', label: 'العملاء', count: stats.customers, icon: User },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو رقم المحل أو الرمز…"
            aria-label="بحث في الجهات"
            className="h-10 ps-9"
          />
        </div>
        {onShowInactiveChange && inactiveCount > 0 && (
          <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-[13px] text-ink-mute touch-manipulation">
            <input
              type="checkbox"
              className="h-4 w-4 accent-foreground"
              checked={showInactive}
              onChange={(e) => onShowInactiveChange(e.target.checked)}
            />
            إظهار غير النشطة ({inactiveCount})
          </label>
        )}
      </div>

      {!hideKindFilters && onRoleFilterChange && (
        <div className="-mx-1 overflow-x-auto px-1 pb-1 no-scrollbar" role="group" aria-label="تصفية حسب الدور">
          <div className="flex w-max gap-1.5">
            {filterTabs.map((tab) => {
              const selected = roleFilter === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onRoleFilterChange(tab.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium transition-colors',
                    selected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-card text-ink-mute hover:text-foreground',
                  )}
                >
                  <TabIcon className="h-3.5 w-3.5" aria-hidden />
                  {tab.label}
                  <span className="tabular-nums opacity-75">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center gap-2 p-12 text-center text-ink-mute">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span className="text-[13px]">جارٍ تحميل الجهات…</span>
        </div>
      ) : filteredContacts.length === 0 ? (
        <Card className="p-12 text-center">
          <Store className="mx-auto mb-2 h-8 w-8 text-ink-mute opacity-50" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">لا توجد جهات مطابقة</h3>
          <p className="mt-1 text-[12.5px] text-ink-mute">جرّب عبارة بحث أخرى أو دوراً آخر.</p>
        </Card>
      ) : (
        <>
          <p className="px-1 text-[12.5px] text-ink-mute">
            {filteredContacts.length} جهة · النشاط عن آخر 12 شهراً (معاملات مُرحّلة)
          </p>

          {/* phone: cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filteredContacts.map((contact) => {
              const roleMeta = CONTACT_ROLES[extractContactBusinessRole(contact)] || CONTACT_ROLES.OTHER;
              const RoleIcon = roleMeta.icon;
              const detail = contactDetail(contact);
              return (
                <li key={contact.id}>
                  <Card className={cn('p-3', !contact.is_active && 'opacity-75')}>
                    <div className="flex items-start gap-3">
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', roleMeta.bgColor, roleMeta.color)} aria-hidden>
                        <RoleIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/contacts/${contact.id}`} className="block truncate text-[14px] font-semibold text-foreground hover:underline">
                          {contact.name}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-mute">
                          <span>{roleMeta.badge}</span>
                          {contact.code && <span className="tabular-nums">· {contact.code}</span>}
                          {!contact.is_active && <Badge variant="neutral">غير نشط</Badge>}
                        </p>
                        {detail && <p className="mt-0.5 truncate text-[12.5px] text-ink-mute">{detail}</p>}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-border pt-2.5 text-[13px]">
                      <ActivityCell contact={contact} activity={activity?.get(contact.id)} />
                      <QuickTxButton contact={contact} />
                    </div>
                    {contact.phone && (
                      <div className="mt-2">
                        <ContactPhoneActions phone={contact.phone} name={contact.name} kind={contact.kind} />
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>

          {/* desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-canvas-sunken text-start text-[12.5px] text-ink-mute">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">الجهة</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">التفاصيل</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">التواصل</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">النشاط (12 شهراً)</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">
                    <span className="sr-only">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map((contact) => {
                  const roleMeta = CONTACT_ROLES[extractContactBusinessRole(contact)] || CONTACT_ROLES.OTHER;
                  const RoleIcon = roleMeta.icon;
                  const detail = contactDetail(contact);
                  return (
                    <tr
                      key={contact.id}
                      className={cn('cursor-pointer align-top transition-colors hover:bg-canvas-sunken/50', !contact.is_active && 'text-ink-mute')}
                      onClick={() => router.push(`/contacts/${contact.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2.5">
                          <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', roleMeta.bgColor, roleMeta.color)} aria-hidden>
                            <RoleIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/contacts/${contact.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-foreground hover:underline"
                            >
                              {contact.name}
                            </Link>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-mute">
                              <span>{roleMeta.badge}</span>
                              {contact.code && <span className="tabular-nums">· {contact.code}</span>}
                              {!contact.is_active && <Badge variant="neutral">غير نشط</Badge>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-64 px-4 py-3 text-ink-mute">{detail ?? '—'}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {contact.phone ? (
                          <ContactPhoneActions phone={contact.phone} name={contact.name} kind={contact.kind} compact />
                        ) : (
                          <span className="text-ink-mute">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ActivityCell contact={contact} activity={activity?.get(contact.id)} />
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <QuickTxButton contact={contact} />
                          {mayMutate && (
                            <>
                              <Button
                                aria-label={`تعديل ${contact.name}`}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-ink-mute hover:text-foreground"
                                onClick={() => onEdit(contact)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label={`حذف ${contact.name}`}
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-danger-ink hover:bg-danger-soft"
                                onClick={() => onDelete(contact.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
