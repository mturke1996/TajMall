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

export function ContactPhoneActions({
  name,
  phone,
  kind,
  className,
  compact = false,
}: Props) {
  if (!phone?.trim()) return null;

  const kindLabel = kind ? contactKindLabelAr(kind) : undefined;

  function openTel() {
    const link = buildTelLink(phone!);
    if (!link) {
      toast.error('رقم الهاتف غير صالح للاتصال');
      return;
    }
    window.location.href = link;
  }

  function openWhatsApp() {
    const message = buildContactWhatsAppMessage({
      contactName: name,
      kindLabelAr: kindLabel,
    });
    const link = buildWhatsAppLink(phone!, message);
    if (!link) {
      toast.error('رقم الهاتف غير صالح لفتح واتساب');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        className="touch-manipulation gap-1.5 text-sage-800 hover:bg-sage-50"
        onClick={openTel}
        title="اتصال"
      >
        <Phone className="h-3.5 w-3.5" />
        {!compact ? <span dir="ltr">{phone}</span> : null}
      </Button>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon-sm' : 'sm'}
        className="touch-manipulation gap-1.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
        onClick={openWhatsApp}
        title="واتساب"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {!compact ? 'واتساب' : null}
      </Button>
    </div>
  );
}
