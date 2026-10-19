'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, MessageCircle, MoreVertical, Pencil, Phone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { buildContactWhatsAppMessage, buildTelLink, buildWhatsAppLink } from '@/lib/whatsapp';
import { contactKindLabelAr } from '@/lib/party-contacts';
import type { Direction } from '@/lib/people/party-stats';
import type { ContactRow } from '@/lib/db/types';
import { cn } from '@/lib/utils';

/** A square icon link, 44px on a phone and 36px with a mouse. */
const ICON_LINK =
  'grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-lg border border-border bg-card text-ink-soft transition-colors hover:border-ink-mute/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-9 sm:w-9';

export function CallLink({ phone, name, className }: { phone: string | null | undefined; name: string; className?: string }) {
  const href = phone?.trim() ? buildTelLink(phone) : null;
  if (!href) return null;
  return (
    <a href={href} aria-label={`اتصال بـ ${name}`} title="اتصال" className={cn(ICON_LINK, className)}>
      <Phone className="h-4 w-4" aria-hidden />
    </a>
  );
}

export function WhatsAppLink({ contact, className }: { contact: Pick<ContactRow, 'name' | 'phone' | 'kind'>; className?: string }) {
  const link = contact.phone?.trim()
    ? buildWhatsAppLink(contact.phone, buildContactWhatsAppMessage({ contactName: contact.name, kindLabelAr: contactKindLabelAr(contact.kind) }))
    : null;
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`واتساب ${contact.name}`}
      title="واتساب"
      className={cn(ICON_LINK, 'text-success-ink hover:border-success-line hover:bg-success-soft hover:text-success-ink', className)}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
    </a>
  );
}

/** The phone number as a link that dials it. */
export function PhoneNumber({ phone, className }: { phone: string | null | undefined; className?: string }) {
  const text = phone?.trim();
  if (!text) return <span className="text-ink-mute">—</span>;
  const href = buildTelLink(text);
  const number = (
    <span dir="ltr" className="tabular-nums">
      {text}
    </span>
  );
  if (!href) return <span className={className}>{number}</span>;
  return (
    <a href={href} className={cn('rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', className)}>
      {number}
    </a>
  );
}

/** «سند صرف» for money paid to a file, «سند قبض» for money received from it. A landlord is paid «سداد إيجار». */
export function VoucherButton({
  direction,
  name,
  onClick,
  className,
  landlord = false,
}: {
  direction: Direction;
  name: string;
  onClick: () => void;
  className?: string;
  landlord?: boolean;
}) {
  const Icon = direction === 'out' ? ArrowUpFromLine : ArrowDownToLine;
  const label = direction === 'out' ? (landlord ? 'سداد إيجار' : 'سند صرف') : 'سند قبض';
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn('h-11 gap-1.5 px-3 text-[13px] sm:h-9', className)}
      aria-label={`${label}: ${name}`}
      onClick={onClick}
    >
      <Icon aria-hidden />
      {label}
    </Button>
  );
}

/** Open, edit, delete: the quiet actions behind a single button. Edit and delete only for people who can write. */
export function RowMenu({
  contact,
  mayMutate,
  onEdit,
  onDelete,
  className,
}: {
  contact: ContactRow;
  mayMutate: boolean;
  /** the button that opened the menu is passed so focus can return to it when the form closes */
  onEdit: (c: ContactRow, opener: HTMLElement | null) => void;
  /** the menu button is passed so focus can return to it when the question is answered */
  onDelete: (id: string, opener: HTMLElement | null) => void;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    // not modal: a modal menu that opens a dialog from an item leaves the page unclickable once the dialog closes
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} type="button" variant="ghost" size="icon" className={cn('h-11 w-11 shrink-0 text-ink-mute sm:h-9 sm:w-9', className)} aria-label={`خيارات ${contact.name}`}>
          <MoreVertical aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild className="min-h-11 sm:min-h-0">
          <Link href={`/contacts/${contact.id}`}>فتح الملف</Link>
        </DropdownMenuItem>
        {mayMutate && (
          <>
            <DropdownMenuItem className="min-h-11 sm:min-h-0" onSelect={() => onEdit(contact, triggerRef.current)}>
              <Pencil aria-hidden />
              تعديل
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11 text-danger-ink focus:bg-danger-soft focus:text-danger-ink sm:min-h-0 [&_svg]:text-danger-ink"
              onSelect={() => onDelete(contact.id, triggerRef.current)}
            >
              <Trash2 aria-hidden />
              حذف
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
