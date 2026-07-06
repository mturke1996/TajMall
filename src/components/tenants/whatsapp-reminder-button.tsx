'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildRentReminderMessage, buildWhatsAppLink } from '@/lib/whatsapp';
import { toast } from 'sonner';

type Props = {
  tenantName: string;
  phone: string | null;
  amountOutstanding: number;
  shopNumber?: string | null;
  asOf?: string;
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
  size = 'sm',
  className,
}: Props) {
  function handleClick() {
    if (!phone) {
      toast.error('لا يوجد رقم هاتف مسجَّل لهذا المستأجر');
      return;
    }
    const message = buildRentReminderMessage({ tenantName, amountOutstanding, shopNumber, asOf });
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
      size={size}
      className={className ?? 'touch-manipulation gap-1.5 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'}
      disabled={!phone}
      onClick={handleClick}
      title={phone ? 'إرسال تذكير عبر واتساب' : 'لا يوجد رقم هاتف'}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {size === 'sm' ? 'واتساب' : null}
    </Button>
  );
}
