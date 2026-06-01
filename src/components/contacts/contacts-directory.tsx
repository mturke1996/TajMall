'use client';

import Link from 'next/link';
import {
  Plus,
  Search,
  Loader2,
  Building2,
  Briefcase,
  User,
  Store,
  Edit2,
  Trash2,
  ChevronLeft,
} from 'lucide-react';
import { MobilePageActionBar, MOBILE_PAGE_ACTION_PADDING } from '@/components/layout/mobile-page-action-bar';
import { MobileContactListItem } from '@/components/contacts/mobile-contact-list-item';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import { KIND_OPTIONS } from '@/components/contacts/contact-form-dialog';

const KIND_STYLES: Record<
  ContactKind,
  { bg: string; icon: string; badge: string }
> = {
  TENANT: { bg: 'bg-blue-100', icon: 'text-blue-600', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  EMPLOYEE: { bg: 'bg-purple-100', icon: 'text-purple-600', badge: 'text-purple-700 bg-purple-50 border-purple-200' },
  CUSTOMER: { bg: 'bg-green-100', icon: 'text-green-600', badge: 'text-green-700 bg-green-50 border-green-200' },
  VENDOR: { bg: 'bg-orange-100', icon: 'text-orange-600', badge: 'text-orange-700 bg-orange-50 border-orange-200' },
  OTHER: { bg: 'bg-slate-100', icon: 'text-slate-600', badge: 'text-slate-700 bg-slate-50 border-slate-200' },
};

export type ContactsDirectoryProps = {
  contacts: ContactRow[];
  filteredContacts: ContactRow[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  kindFilter: ContactKind | 'ALL';
  onKindFilterChange: (k: ContactKind | 'ALL') => void;
  stats: {
    total: number;
    tenants: number;
    employees: number;
    customers: number;
    vendors?: number;
  };
  onAdd: (kind?: ContactKind) => void;
  onEdit: (contact: ContactRow) => void;
  onDelete: (id: string) => void;
  /** إخفاء شرائح التصفية عند استخدام تبويب فرعي في المول */
  hideKindFilters?: boolean;
};

function ContactSubtitle({ contact }: { contact: ContactRow }) {
  if (contact.shop_number) {
    return (
      <span>
        محل {contact.shop_number}
        {contact.floor ? ` · ط${contact.floor}` : ''}
      </span>
    );
  }
  if (contact.job_title) {
    return (
      <span>
        {contact.job_title}
        {contact.department ? ` · ${contact.department}` : ''}
      </span>
    );
  }
  if (contact.phone) {
    return <span dir="ltr" className="inline-block">{contact.phone}</span>;
  }
  return <span className="italic opacity-70">بدون تفاصيل إضافية</span>;
}

function StatChip({
  label,
  value,
  icon: Icon,
  active,
  onClick,
  className,
  iconClassName,
}: {
  label: string;
  value: number;
  icon: typeof User;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-[7.5rem] shrink-0 snap-center flex-col gap-1 rounded-xl border p-3 text-right transition-colors',
        'sm:min-w-0 sm:flex-row sm:items-center sm:gap-3 sm:p-4',
        active
          ? 'border-sage-600 bg-sage-50 ring-1 ring-sage-600/20'
          : 'border-border bg-card hover:border-sage-300',
        onClick && 'cursor-pointer active:scale-[0.98]',
        className,
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg sm:h-11 sm:w-11',
          className,
        )}
      >
        <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', iconClassName)} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-ink-mute sm:text-xs">{label}</p>
        <p className="text-lg font-bold tabular-nums sm:text-xl">{value}</p>
      </div>
    </Comp>
  );
}

function ContactActions({
  contact,
  onEdit,
  onDelete,
}: {
  contact: ContactRow;
  onEdit: (c: ContactRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 touch-manipulation"
        aria-label="تعديل"
        onClick={() => onEdit(contact)}
      >
        <Edit2 className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 text-red-600 touch-manipulation"
        aria-label="حذف"
        onClick={() => onDelete(contact.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ContactsDirectory({
  contacts,
  filteredContacts,
  isLoading,
  searchQuery,
  onSearchChange,
  kindFilter,
  onKindFilterChange,
  stats,
  onAdd,
  onEdit,
  onDelete,
  hideKindFilters = false,
}: ContactsDirectoryProps) {
  const vendorCount = stats.vendors ?? contacts.filter((c) => c.kind === 'VENDOR').length;
  const filterChips: { value: ContactKind | 'ALL'; label: string; count: number; icon?: typeof User }[] = [
    { value: 'ALL', label: 'الكل', count: stats.total },
    { value: 'TENANT', label: 'مستأجر', count: stats.tenants, icon: Building2 },
    { value: 'EMPLOYEE', label: 'موظف', count: stats.employees, icon: Briefcase },
    { value: 'CUSTOMER', label: 'عميل', count: stats.customers, icon: User },
    { value: 'VENDOR', label: 'مورد', count: vendorCount, icon: Store },
  ];

  const quickAddKinds =
    kindFilter === 'ALL'
      ? KIND_OPTIONS
      : KIND_OPTIONS.filter((k) => k.value === kindFilter);

  return (
    <div className={cn('flex flex-col gap-4 md:gap-6', MOBILE_PAGE_ACTION_PADDING)}>
      {!hideKindFilters && (
      <div className="-mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory no-scrollbar md:grid md:grid-cols-4 md:overflow-visible">
          <StatChip
            label="الإجمالي"
            value={stats.total}
            icon={User}
            className="bg-slate-100"
            iconClassName="text-slate-600"
            active={kindFilter === 'ALL'}
            onClick={() => onKindFilterChange('ALL')}
          />
          <StatChip
            label="المستأجرين"
            value={stats.tenants}
            icon={Building2}
            className="bg-blue-100"
            iconClassName="text-blue-600"
            active={kindFilter === 'TENANT'}
            onClick={() => onKindFilterChange('TENANT')}
          />
          <StatChip
            label="الموظفين"
            value={stats.employees}
            icon={Briefcase}
            className="bg-purple-100"
            iconClassName="text-purple-600"
            active={kindFilter === 'EMPLOYEE'}
            onClick={() => onKindFilterChange('EMPLOYEE')}
          />
          <StatChip
            label="العملاء"
            value={stats.customers}
            icon={Store}
            className="bg-green-100"
            iconClassName="text-green-600"
            active={kindFilter === 'CUSTOMER'}
            onClick={() => onKindFilterChange('CUSTOMER')}
          />
        </div>
      </div>
      )}

      {/* شريط بحث وفلاتر — ثابت على الجوال */}
      <div className="sticky top-0 z-20 -mx-4 space-y-3 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/80 md:static md:mx-0 md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <Input
            placeholder="بحث: الاسم، الهاتف، رقم المحل…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 pr-10 text-base md:h-10 md:text-sm"
            autoComplete="off"
          />
        </div>

        {!hideKindFilters && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-1 px-1">
          {filterChips.map((chip) => {
            const Icon = chip.icon;
            const isActive = kindFilter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => onKindFilterChange(chip.value)}
                className={cn(
                  'inline-flex shrink-0 snap-center items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors touch-manipulation',
                  isActive
                    ? 'border-sage-700 bg-sage-700 text-white shadow-sm'
                    : 'border-border bg-card text-ink hover:bg-secondary',
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {chip.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                    isActive ? 'bg-white/20' : 'bg-canvas-sunken text-ink-mute',
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
        )}

        {/* اختصارات إضافة سريعة — جوال */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar md:hidden">
          {quickAddKinds.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => onAdd(k.value)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-[12px] font-medium touch-manipulation active:bg-secondary"
            >
              <k.icon className={cn('h-3.5 w-3.5', k.color)} />
              {k.label.split(' ')[0]}
            </button>
          ))}
        </div>

        {/* اختصارات إضافة — سطح المكتب */}
        <div className="hidden flex-wrap gap-2 md:flex">
          {quickAddKinds.map((k) => (
            <Button
              key={k.value}
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => onAdd(k.value)}
            >
              <Plus className="h-3.5 w-3.5" />
              {k.label}
            </Button>
          ))}
        </div>
      </div>

      {/* عداد النتائج */}
      {!isLoading && (
        <p className="text-[12px] text-ink-mute md:text-sm">
          {filteredContacts.length === contacts.length
            ? `${contacts.length} سجل`
            : `${filteredContacts.length} من ${contacts.length} سجل`}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          <p className="text-sm text-ink-mute">جارٍ تحميل الدليل…</p>
        </div>
      ) : filteredContacts.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <User className="h-10 w-10 text-ink-mute/60" />
          <p className="mt-3 font-medium">لا توجد نتائج</p>
          <p className="mt-1 max-w-xs text-sm text-ink-mute">
            {searchQuery
              ? 'جرّب كلمة بحث أخرى أو غيّر التصفية'
              : 'ابدأ بإضافة أول جهة بالاسم فقط'}
          </p>
          <Button className="mt-5 min-h-11 px-6" onClick={() => onAdd()}>
            <Plus className="h-4 w-4 ml-1" />
            إضافة جديد
          </Button>
        </Card>
      ) : (
        <>
          {/* جدول — شاشات كبيرة */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-canvas-sunken/80 text-right text-[12px] text-ink-mute">
                    <th className="px-4 py-3 font-semibold">الاسم</th>
                    <th className="px-4 py-3 font-semibold">النوع</th>
                    <th className="px-4 py-3 font-semibold">الهاتف</th>
                    <th className="px-4 py-3 font-semibold">تفاصيل</th>
                    <th className="px-4 py-3 font-semibold w-[120px]">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((contact, i) => {
                    const kindInfo = KIND_OPTIONS.find((k) => k.value === contact.kind);
                    const styles = KIND_STYLES[contact.kind];
                    const Icon = kindInfo?.icon ?? User;
                    return (
                      <tr
                        key={contact.id}
                        className={cn(
                          'border-b border-border/60 transition-colors hover:bg-sage-50/40',
                          i % 2 === 1 && 'bg-canvas-sunken/20',
                        )}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="font-medium text-ink hover:text-sage-700 hover:underline"
                          >
                            {contact.name}
                          </Link>
                          {contact.code && (
                            <p className="text-[11px] text-ink-mute">{contact.code}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium',
                              styles.badge,
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {kindInfo?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-mute" dir="ltr">
                          {contact.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-ink-mute max-w-[200px] truncate">
                          <ContactSubtitle contact={contact} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="h-8" asChild>
                              <Link href={`/contacts/${contact.id}`}>الملف</Link>
                            </Button>
                            <ContactActions
                              contact={contact}
                              onEdit={onEdit}
                              onDelete={onDelete}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* بطاقات — تابلت */}
          <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:hidden">
            {filteredContacts.map((contact) => {
              const kindInfo = KIND_OPTIONS.find((k) => k.value === contact.kind);
              const styles = KIND_STYLES[contact.kind];
              const Icon = kindInfo?.icon ?? User;
              return (
                <Card
                  key={contact.id}
                  className="overflow-hidden transition-shadow hover:shadow-md"
                >
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="flex items-start gap-3 p-4 active:bg-secondary/30"
                  >
                    <div
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        styles.bg,
                      )}
                    >
                      <Icon className={cn('h-5 w-5', styles.icon)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug">{contact.name}</h3>
                        <ChevronLeft className="h-4 w-4 shrink-0 text-ink-mute" />
                      </div>
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {kindInfo?.label}
                      </Badge>
                      <p className="mt-2 text-[13px] text-ink-mute">
                        <ContactSubtitle contact={contact} />
                      </p>
                    </div>
                  </Link>
                  <div className="flex border-t border-border px-2 py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => onEdit(contact)}
                    >
                      <Edit2 className="h-4 w-4 ml-1" />
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-red-600"
                      onClick={() => onDelete(contact.id)}
                    >
                      <Trash2 className="h-4 w-4 ml-1" />
                      حذف
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* قائمة — جوال */}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border sm:hidden">
            {filteredContacts.map((contact) => (
              <MobileContactListItem
                key={contact.id}
                contact={contact}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </>
      )}

      <MobilePageActionBar>
        <Button
          className="h-12 w-full gap-2 text-base font-semibold shadow-sm touch-manipulation"
          onClick={() => onAdd(kindFilter === 'ALL' ? undefined : kindFilter)}
        >
          <Plus className="h-5 w-5" />
          إضافة{' '}
          {kindFilter !== 'ALL'
            ? filterChips.find((c) => c.value === kindFilter)?.label ?? ''
            : 'جديد'}
        </Button>
      </MobilePageActionBar>
    </div>
  );
}
