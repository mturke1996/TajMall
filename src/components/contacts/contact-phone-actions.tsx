'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildContactWhatsAppMessage,
  buildTelLink,
  buildWhatsAppLink,
} from '@/lib/whatsapp';
import { contactKindLabelAr } from '@/lib/party-contacts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Props = {
  name: string;
  phone: string | null | undefined;
  kind?: string;
  className?: string;
  compact?: boolean;
};

// 44px tap targets on a phone; the dense desktop tables keep the small buttons
const TAP = 'touch-manipulation max-sm:min-h-11';

function openWhatsApp(name: string, phone: string, kind?: string) {
  const message = buildContactWhatsAppMessage({
    contactName: name,
    kindLabelAr: kind ? contactKindLabelAr(kind) : undefined,
  });
  const link = buildWhatsAppLink(phone, message);
  if (!link) {
    toast.error('رقم الهاتف غير صالح لفتح واتساب');
    return;
  }
  window.open(link, '_blank', 'noopener,noreferrer');
}

/** One WhatsApp button, for a header that already shows the number as a call link. */
export function ContactWhatsAppButton({
  name,
  phone,
  kind,
  className,
  iconOnly = false,
  iconOnPhone = false,
}: {
  name: string;
  phone: string | null | undefined;
  kind?: string;
  className?: string;
  /** the icon alone, at every width */
  iconOnly?: boolean;
  /** the icon alone on a phone, with the word from the sm breakpoint up */
  iconOnPhone?: boolean;
}) {
  if (!phone?.trim()) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? 'icon' : 'default'}
      className={cn(
        TAP,
        'gap-1.5 text-success-ink hover:bg-success-soft hover:text-success-ink',
        iconOnly && 'max-sm:w-11',
        iconOnPhone && 'max-sm:w-11 max-sm:px-0',
        className,
      )}
      onClick={() => openWhatsApp(name, phone, kind)}
      aria-label={iconOnly || iconOnPhone ? `واتساب ${name}` : undefined}
      title="واتساب"
    >
      <MessageCircle aria-hidden />
      {!iconOnly ? <span className={cn(iconOnPhone && 'max-sm:hidden')}>واتساب</span> : null}
    </Button>
  );
}

export function ContactPhoneActions({
  name,
  phone,
  kind,
  className,
  compact = false,
}: Props) {
  if (!phone?.trim()) return null;

  function openTel() {
    const link = buildTelLink(phone!);
    if (!link) {
      toast.error('رقم الهاتف غير صالح للاتصال');
      return;
    }
    window.location.href = link;
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        className={cn(TAP, 'gap-1.5 text-foreground hover:bg-canvas-sunken', compact && 'max-sm:w-11')}
        onClick={openTel}
        aria-label={compact ? `اتصال بـ ${name}` : undefined}
        title="اتصال"
      >
        <Phone aria-hidden />
        {!compact ? <span dir="ltr">{phone}</span> : null}
      </Button>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        className={cn(TAP, 'gap-1.5 text-success-ink hover:bg-success-soft hover:text-success-ink', compact && 'max-sm:w-11')}
        onClick={() => openWhatsApp(name, phone!, kind)}
        aria-label={compact ? `واتساب ${name}` : undefined}
        title="واتساب"
      >
        <MessageCircle aria-hidden />
        {!compact ? 'واتساب' : null}
      </Button>
    </div>
  );
}
