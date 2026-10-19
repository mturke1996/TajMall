'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildRentReminderMessage, buildWhatsAppLink, type RentReminderBasis } from '@/lib/whatsapp';
import { toast } from 'sonner';

type Props = {
  tenantName: string;
  phone: string | null;
  amountOutstanding: number;
  shopNumber?: string | null;
  asOf?: string;
  /** what the amount is for (a month, a period or everything unpaid); without it the message only says "rent dues" */
  basis?: RentReminderBasis;
  size?: 'sm' | 'icon-sm';
  className?: string;
};

/**
 * يفتح واتساب (تطبيق أو ويب) برسالة تذكير جاهزة بالإيجار المتأخر —
 * بدون أي مفتاح API أو مزوّد خارجي (رابط wa.me مباشر). المستخدم يراجع
 * الرسالة ويضغط إرسال من واتساب نفسه.
 */
export function WhatsAppReminderButton({
  tenantName,
  phone,
  amountOutstanding,
  shopNumber,
  asOf,
  basis,
  size = 'sm',
  className,
}: Props) {
  function handleClick() {
    if (!phone) {
      toast.error('لا يوجد رقم هاتف مسجَّل لهذا المستأجر');
      return;
    }
    const message = buildRentReminderMessage({ tenantName, amountOutstanding, shopNumber, asOf, basis });
    const link = buildWhatsAppLink(phone, message);
    if (!link) {
      toast.error('رقم الهاتف غير صالح لفتح واتساب');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  // many of these sit in one list: an icon alone must say whose reminder it opens
  const label = phone ? `إرسال تذكير عبر واتساب إلى ${tenantName}` : 'لا يوجد رقم هاتف';

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className ?? 'touch-manipulation gap-1.5 text-success-ink hover:bg-success-soft hover:text-success-ink'}
      disabled={!phone}
      onClick={handleClick}
      title={label}
      aria-label={size === 'icon-sm' ? label : undefined}
    >
      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
      {size === 'sm' ? 'واتساب' : null}
    </Button>
  );
}
