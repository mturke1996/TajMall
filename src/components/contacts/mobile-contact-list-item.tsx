'use client';

import Link from 'next/link';
import { ChevronLeft, Edit2, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ContactRow } from '@/lib/db/types';
import { KIND_OPTIONS } from '@/components/contacts/contact-form-dialog';

const KIND_STYLES: Record<
  string,
  { bg: string; icon: string; badge: string }
> = {
  TENANT: { bg: 'bg-blue-100', icon: 'text-blue-600', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  EMPLOYEE: { bg: 'bg-purple-100', icon: 'text-purple-600', badge: 'text-purple-700 bg-purple-50 border-purple-200' },
  CUSTOMER: { bg: 'bg-green-100', icon: 'text-green-600', badge: 'text-green-700 bg-green-50 border-green-200' },
  VENDOR: { bg: 'bg-orange-100', icon: 'text-orange-600', badge: 'text-orange-700 bg-orange-50 border-orange-200' },
  OTHER: { bg: 'bg-slate-100', icon: 'text-slate-600', badge: 'text-slate-700 bg-slate-50 border-slate-200' },
};

function ContactSubtitle({ contact }: { contact: ContactRow }) {
  if (contact.shop_number) {
    return <>محل {contact.shop_number}{contact.floor ? ` · ط${contact.floor}` : ''}</>;
  }
  if (contact.phone) {
    return <span dir="ltr">{contact.phone}</span>;
  }
  return <span className="italic opacity-70">بدون تفاصيل</span>;
}

export function MobileContactListItem({
  contact,
  onEdit,
  onDelete,
  allowMutate = true,
}: {
  contact: ContactRow;
  onEdit: (c: ContactRow) => void;
  onDelete: (id: string) => void;
  allowMutate?: boolean;
}) {
  const kindInfo = KIND_OPTIONS.find((k) => k.value === contact.kind);
  const styles = KIND_STYLES[contact.kind] ?? KIND_STYLES.OTHER;
  const Icon = kindInfo?.icon;

  return (
    <li className="bg-card">
      <Link
        href={`/contacts/${contact.id}`}
        className="flex items-center gap-3 px-3 py-3.5 min-h-[72px] active:bg-secondary/50 touch-manipulation"
      >
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            styles.bg,
          )}
        >
          {Icon && <Icon className={cn('h-6 w-6', styles.icon)} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15px] leading-tight truncate">{contact.name}</p>
          <p className="mt-0.5 text-[13px] text-ink-mute line-clamp-1">
            <ContactSubtitle contact={contact} />
          </p>
          <span
            className={cn(
              'mt-1.5 inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium',
              styles.badge,
            )}
          >
            {kindInfo?.label}
          </span>
        </div>
        <ChevronLeft className="h-5 w-5 shrink-0 text-ink-mute" aria-hidden />
      </Link>
      <div className="flex border-t border-border divide-x divide-border rtl:divide-x-reverse">
        <Button
          variant="ghost"
          className={cn('h-11 rounded-none gap-1.5 text-[13px] touch-manipulation', allowMutate ? 'flex-1' : 'w-full')}
          asChild
        >
          <Link href={`/contacts/${contact.id}`}>
            <FileText className="h-4 w-4" />
            الملف
          </Link>
        </Button>
        {allowMutate && (
          <>
            <Button
              variant="ghost"
              className="flex-1 h-11 rounded-none gap-1.5 text-[13px] touch-manipulation"
              onClick={() => onEdit(contact)}
            >
              <Edit2 className="h-4 w-4" />
              تعديل
            </Button>
            <Button
              variant="ghost"
              className="flex-1 h-11 rounded-none gap-1.5 text-[13px] text-red-600 touch-manipulation"
              onClick={() => onDelete(contact.id)}
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
