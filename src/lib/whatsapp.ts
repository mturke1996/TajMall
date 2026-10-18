import { formatMoney } from '@/lib/utils';

/**
 * يحوّل رقم هاتف ليبي محلي (0912345678 أو 912345678) إلى صيغة دولية بلا
 * علامة + (218912345678) — الصيغة التي يتوقعها wa.me. أرقام دولية مُدخلة
 * مسبقاً (+218...، 00218...) تُطبَّع أيضاً. لا يوجد تحقق صارم — أي شيء
 * غير معروف يُعاد بعد تجريد الرموز فقط، ويترك واتساب نفسه يُظهر خطأً
 * إن كان الرقم غير صالح بدل حجب الميزة كاملة.
 */
export function normalizeLibyanPhone(raw: string): string | null {
  // Arabic-Indic digits (٠٩١…) are the same number
  const latin = String(raw ?? '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let digits = latin.replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('218')) {
    // "+218 091 234 5678": the trunk 0 is written after the country code by habit
    const rest = digits.slice(3);
    return `218${rest.startsWith('0') ? rest.slice(1) : rest}`;
  }
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  if (digits.length === 9) return `218${digits}`;
  return digits;
}

export function buildWhatsAppLink(phone: string, message: string): string | null {
  const normalized = normalizeLibyanPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** رابط اتصال هاتفي — للأرقام المحلية والدولية بعد التطبيع. */
export function buildTelLink(phone: string): string | null {
  const normalized = normalizeLibyanPhone(phone);
  if (!normalized) return null;
  return `tel:+${normalized}`;
}

/** رسالة ترحيب عامة لأي جهة اتصال (مورد/عميل/مستأجر/موظف). */
export function buildContactWhatsAppMessage(input: {
  contactName: string;
  kindLabelAr?: string;
}): string {
  const kind = input.kindLabelAr ? ` (${input.kindLabelAr})` : '';
  return [
    `السلام عليكم ${input.contactName}${kind}،`,
    '',
    'تحية طيبة من إدارة تاج مول.',
    '',
    'إدارة تاج مول',
  ].join('\n');
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
