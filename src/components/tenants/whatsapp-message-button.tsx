'use client';

import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { buildWhatsAppLink } from '@/lib/whatsapp';

/**
 * Opens WhatsApp (app or web) with a ready message to a tenant. There is no API key or provider: it is
 * a plain wa.me link, and the person reads and sends the message from WhatsApp itself.
 */
export function WhatsAppMessageButton({
  phone,
  message,
  label = 'واتساب',
  title = 'إرسال رسالة عبر واتساب',
  className,
}: {
  phone: string | null;
  message: string;
  label?: string | null;
  title?: string;
  className?: string;
}) {
  function open() {
    if (!phone) {
      toast.error('لا يوجد رقم هاتف مسجَّل لهذا المستأجر');
      return;
    }
    const link = buildWhatsAppLink(phone, message);
    if (!link) {
      toast.error('رقم الهاتف غير صالح لفتح واتساب');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? 'h-8 touch-manipulation gap-1.5 text-success-ink hover:bg-success-soft hover:text-success-ink'}
      disabled={!phone}
      onClick={open}
      title={phone ? title : 'لا يوجد رقم هاتف'}
      aria-label={label ? undefined : title}
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}
