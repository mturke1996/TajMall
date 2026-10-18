'use client';

import Link from 'next/link';
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
  ChevronLeft,
  Filter,
  DollarSign,
} from 'lucide-react';
import { MobilePageActionBar } from '@/components/layout/mobile-page-action-bar';
import { ContactPhoneActions } from '@/components/contacts/contact-phone-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatMoney } from '@/lib/utils';
import type { ContactKind, ContactRow } from '@/lib/db/types';
import { useTxDialog } from '@/stores/transaction-dialog';
import { suggestedTxKindForContact } from '@/lib/party-contacts';
import { usePermission } from '@/lib/supabase/use-permission';
import {
  extractContactBusinessRole,
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
};

function QuickTxButton({
  contact,
  className,
}: {
  contact: ContactRow;
  className?: string;
}) {
  const open = useTxDialog((s) => s.open);
  const { can, loading } = usePermission();
  const role = extractContactBusinessRole(contact);
  const isPayable = role === 'LANDLORD' || role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER' || role === 'SUPPLIER_GOODS' || role === 'SERVICE_PROVIDER' || role === 'EMPLOYEE';
  const kind = isPayable ? 'EXPENSE' : 'REVENUE';
  const perm = kind === 'REVENUE' ? 'revenue.create' : 'expense.create';

  if (loading || !can(perm)) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn('h-7 px-2 text-xs gap-1 font-semibold', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open({
          kind,
          contactId: contact.id,
          contactKind: contact.kind,
        });

      }}
    >
      <Plus className="h-3 w-3" />
      {role === 'LANDLORD' ? 'سداد إيجار' : isPayable ? 'سند صرف' : 'سند قبض'}
    </Button>
  );
}

function ContactRoleSubtitle({ contact }: { contact: ContactRow }) {
  const role = extractContactBusinessRole(contact);

  if (role === 'LANDLORD') {
    return (
      <span className="text-warning-ink font-medium">
        {contact.shop_number ? `موقع: ${contact.shop_number}` : 'عقار مؤجر للمول'}
        {contact.monthly_rent && Number(contact.monthly_rent) > 0 ? ` · إيجار: ${formatMoney(Number(contact.monthly_rent), 'د.ل')}/شهر` : ''}
      </span>
    );
  }

  if (role === 'TENANT') {
    return (
      <span className="text-success-ink font-medium">
        محل {contact.shop_number || '—'}
        {contact.floor ? ` · ط${contact.floor}` : ''}
        {contact.monthly_rent && Number(contact.monthly_rent) > 0 ? ` · إيجار: ${formatMoney(Number(contact.monthly_rent), 'د.ل')}/شهر` : ''}
      </span>
    );
  }

  if (role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER') {
    return (
      <span className="text-foreground font-medium">
        {contact.shop_number ? `عداد/معرف: ${contact.shop_number}` : 'مورد طاقة/مياه'}
        {contact.department ? ` · ${contact.department}` : ''}
      </span>
    );
  }

  if (role === 'EMPLOYEE') {
    return (
      <span className="text-plum-ink font-medium">
        {contact.job_title || 'موظف'}
        {contact.department ? ` · ${contact.department}` : ''}
      </span>
    );
  }

  if (contact.job_title || contact.department) {
    return (
      <span>
        {contact.job_title || ''}
        {contact.department ? ` · ${contact.department}` : ''}
      </span>
    );
  }

  if (contact.phone) {
    return <span dir="ltr" className="font-mono text-muted-foreground">{contact.phone}</span>;
  }

  return <span className="italic text-muted-foreground">بدون تفاصيل إضافية</span>;
}

export function ContactsDirectory({
  contacts,
  filteredContacts,
  isLoading,
  searchQuery,
  onSearchChange,
  roleFilter = 'ALL',
  onRoleFilterChange,
  stats,
  onAdd,
  onEdit,
  onDelete,
  hideKindFilters = false,
  allowMutate = true,
}: ContactsDirectoryProps) {
  const { canWrite } = usePermission();

  const filterTabs: Array<{
    id: ContactBusinessRole | 'ALL';
    label: string;
    count: number;
    icon: typeof User;
  }> = [
    { id: 'ALL', label: 'الكل', count: stats.total, icon: Store },
    { id: 'TENANT', label: 'مستأجري المحلات', count: stats.tenants, icon: Building2 },
    { id: 'LANDLORD', label: 'مؤجرين للمول', count: stats.landlords, icon: Building },
    { id: 'SUPPLIER_ELECTRICITY', label: 'موردي الكهرباء والطاقة', count: stats.electricity, icon: Zap },
    { id: 'SUPPLIER_WATER', label: 'موردي المياه والصرف', count: stats.water, icon: Droplets },
    { id: 'SUPPLIER_GOODS', label: 'موردي البضائع والمواد', count: stats.goods, icon: Package },
    { id: 'SERVICE_PROVIDER', label: 'مقدمي الخدمات والمقاولات', count: stats.services, icon: Wrench },
    { id: 'EMPLOYEE', label: 'الموظفين', count: stats.employees, icon: Briefcase },
    { id: 'CUSTOMER', label: 'العملاء', count: stats.customers, icon: User },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar with Search & Add */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث بالاسم، رقم المحل/العقار، الهاتف، المسمى، أو الكود…"
            className="ps-9 text-xs h-9 bg-canvas"
          />
        </div>

        {allowMutate && canWrite && (
          <Button
            onClick={() => onAdd(roleFilter !== 'ALL' ? roleFilter : undefined)}
            className="gap-1.5 h-9 text-xs font-bold shadow-xs shrink-0"
          >
            <Plus className="h-4 w-4" />
            إضافة جهة جديدة
          </Button>
        )}
      </div>

      {/* 2. Role Filter Tabs (شرائح التصفية الذكية) */}
      {!hideKindFilters && onRoleFilterChange && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {filterTabs.map((tab) => {
            const isSelected = roleFilter === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onRoleFilterChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <TabIcon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
                  isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Directory Table / List */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs">جاري تحميل سجلات جهات الاتصال…</span>
        </div>
      ) : filteredContacts.length === 0 ? (
        <Card className="p-12 text-center border-border">
          <Store className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
          <h3 className="text-sm font-bold text-foreground">لا توجد سجلات مطابقة</h3>
          <p className="text-xs text-muted-foreground mt-1">جرّب تغيير عبارة البحث أو الفلتر المحدد.</p>
        </Card>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start" dir="rtl">
              <thead>
                <tr className="bg-canvas-sunken text-muted-foreground font-semibold border-b border-border">
                  <th className="py-3 px-4">الاسم وجهة التعامل</th>
                  <th className="py-3 px-4">التصنيف والدور</th>
                  <th className="py-3 px-4">بيانات الموقع / العقد / العداد</th>
                  <th className="py-3 px-4">الهاتف والتواصل</th>
                  <th className="py-3 px-4 text-center">الإجراء السريع</th>
                  <th className="py-3 px-4 text-end">إدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredContacts.map((contact) => {
                  const role = extractContactBusinessRole(contact);
                  const roleMeta = CONTACT_ROLES[role] || CONTACT_ROLES.OTHER;
                  const RoleIcon = roleMeta.icon;

                  return (
                    <tr
                      key={contact.id}
                      className="hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => {
                        window.location.href = `/contacts/${contact.id}`;
                      }}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', roleMeta.bgColor, roleMeta.color)}>
                            <RoleIcon className="h-4 w-4 stroke-[1.8]" />
                          </div>
                          <div>
                            <span className="font-bold text-foreground block group-hover:text-primary transition-colors">
                              {contact.name}
                            </span>
                            {contact.code ? (
                              <span className="text-[10px] text-muted-foreground font-mono">{contact.code}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant="outline" className={cn('gap-1 font-semibold text-[11px]', roleMeta.borderColor, roleMeta.bgColor, roleMeta.color)}>
                          <RoleIcon className="h-3 w-3" />
                          {roleMeta.badge}
                        </Badge>
                      </td>

                      <td className="py-3 px-4">
                        <ContactRoleSubtitle contact={contact} />
                      </td>

                      <td className="py-3 px-4 font-mono text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                        <ContactPhoneActions phone={contact.phone} name={contact.name} />
                      </td>

                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <QuickTxButton contact={contact} />
                      </td>

                      <td className="py-3 px-4 text-end" onClick={(e) => e.stopPropagation()}>
                        {allowMutate && canWrite && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => onEdit(contact)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-danger hover:bg-danger-soft"
                              onClick={() => onDelete(contact.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
