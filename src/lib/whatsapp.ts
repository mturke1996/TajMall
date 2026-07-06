import { formatMoney } from '@/lib/utils';

/**
 * يحوّل رقم هاتف ليبي محلي (0912345678 أو 912345678) إلى صيغة دولية بلا
 * علامة + (218912345678) — الصيغة التي يتوقعها wa.me. أرقام دولية مُدخلة
 * مسبقاً (+218...، 00218...) تُطبَّع أيضاً. لا يوجد تحقق صارم — أي شيء
 * غير معروف يُعاد بعد تجريد الرموز فقط، ويترك واتساب نفسه يُظهر خطأً
 * إن كان الرقم غير صالح بدل حجب الميزة كاملة.
 */
export function normalizeLibyanPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('00218')) return digits.slice(2);
  if (digits.startsWith('218')) return digits;
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  if (digits.length === 9) return `218${digits}`;
  return digits;
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const normalized = normalizeLibyanPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** رسالة تذكير جاهزة لمستأجر متأخر عن السداد — قابلة للتعديل قبل الإرسال داخل واتساب. */
export function buildRentReminderMessage(input: {
  tenantName: string;
  amountOutstanding: number;
  shopNumber?: string | null;
  asOf?: string;
}): string {
  const { tenantName, amountOutstanding, shopNumber, asOf } = input;
  const lines = [
    `السيد/ة ${tenantName}،`,
    '',
    `نود تذكيركم بوجود مستحقات إيجار${shopNumber ? ` للمحل رقم ${shopNumber}` : ''} بقيمة ${formatMoney(amountOutstanding, 'LYD')}${asOf ? ` حتى تاريخ ${asOf}` : ''}.`,
    'يرجى التكرم بالتسديد في أقرب وقت ممكن، ونشكر لكم تعاونكم.',
    '',
    'إدارة تاج مول',
  ];
  return lines.join('\n');
}
