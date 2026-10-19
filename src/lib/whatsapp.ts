import type { PaymentReceipt } from '@/lib/payment-receipt';
import { arabicCount, formatDate, formatMoney } from '@/lib/utils';

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

/**
 * What the amount in a reminder is for. Without it the message says only "rent dues"; with it the tenant
 * reads whether the figure is one month's rent, the months of a period, or everything unpaid.
 */
export type RentReminderBasis =
  | { kind: 'month'; label: string }
  | { kind: 'period'; label: string }
  | { kind: 'all' };

function reminderBasisPhrase(basis: RentReminderBasis): string {
  if (basis.kind === 'month') return `من إيجار شهر ${basis.label}`;
  if (basis.kind === 'period') return `من إيجار الفترة (${basis.label})`;
  return 'من إيجار كل الأشهر غير المسدّدة';
}

/** رسالة تذكير جاهزة لمستأجر متأخر عن السداد — قابلة للتعديل قبل الإرسال داخل واتساب. */
export function buildRentReminderMessage(input: {
  tenantName: string;
  amountOutstanding: number;
  shopNumber?: string | null;
  asOf?: string;
  basis?: RentReminderBasis;
}): string {
  const { tenantName, amountOutstanding, shopNumber, asOf, basis } = input;
  const shop = shopNumber ? ` للمحل رقم ${shopNumber}` : '';
  const upTo = asOf ? ` حتى تاريخ ${asOf}` : '';
  const money = formatMoney(amountOutstanding, 'LYD');
  const ask = basis
    ? `نود تذكيركم بأن المستحق ${reminderBasisPhrase(basis)}${shop} هو ${money}${upTo}.`
    : `نود تذكيركم بوجود مستحقات إيجار${shop} بقيمة ${money}${upTo}.`;
  const lines = [
    `السيد/ة ${tenantName}،`,
    '',
    ask,
    'يرجى التكرم بالتسديد في أقرب وقت ممكن، ونشكر لكم تعاونكم.',
    '',
    'إدارة تاج مول',
  ];
  return lines.join('\n');
}

/**
 * رسالة تنبيه لمستأجر بقرب انتهاء عقده (أو بانتهائه). `daysLeft` سالب إن كان التاريخ قد مضى.
 */
export function buildContractExpiryMessage(input: {
  tenantName: string;
  shopNumber?: string | null;
  endDate: string;
  daysLeft: number;
}): string {
  const { tenantName, shopNumber, endDate, daysLeft } = input;
  const shop = shopNumber ? `المحل رقم ${shopNumber}` : 'المحل';
  const when = formatDate(endDate);
  const days = (n: number) => arabicCount(n, ['يوم واحد', 'يومين', 'أيام', 'يوماً']);
  const body =
    daysLeft < 0
      ? `نفيدكم بأن عقد إيجار ${shop} انتهى بتاريخ ${when}. نرجو التواصل مع الإدارة لتجديد العقد أو ترتيب تسليم المحل.`
      : daysLeft === 0
        ? `نفيدكم بأن عقد إيجار ${shop} ينتهي اليوم (${when}). نرجو التواصل مع الإدارة لتجديد العقد.`
        : `نفيدكم بأن عقد إيجار ${shop} ينتهي بتاريخ ${when} (بعد ${days(daysLeft)}). نرجو التواصل مع الإدارة قبل هذا التاريخ لتجديد العقد.`;
  return [`السيد/ة ${tenantName}،`, '', body, 'ونشكر لكم تعاونكم.', '', 'إدارة تاج مول'].join('\n');
}

/**
 * The message that goes with a receipt: what was received, for which months, what is left and the receipt
 * number. It says everything the paper does, so the tenant can keep it as the receipt itself.
 */
export function buildPaymentReceiptMessage(receipt: PaymentReceipt): string {
  const name = receipt.payer.name;
  // «للمحل» says what the money was for, which only rent does; another revenue from a tenant is not for the shop
  const shop = receipt.kind === 'rent' && receipt.payer.shopNumber ? ` للمحل رقم ${receipt.payer.shopNumber}` : '';
  const lines = [name ? `السيد/ة ${name}،` : 'تحية طيبة،', ''];
  lines.push(`استلمنا منكم ${formatMoney(receipt.total, 'LYD')} بتاريخ ${formatDate(receipt.date)}${shop}.`);

  if (receipt.kind === 'rent' && receipt.lines.length > 0) {
    lines.push('', ...receipt.lines.map((l) => `${l.label}: ${l.statusLabel}`));
    if (receipt.balance?.kind === 'remaining') {
      lines.push('', `${receipt.balance.label}: ${formatMoney(receipt.balance.amount, 'LYD')}`);
    } else if (receipt.balance?.kind === 'settled') {
      lines.push('', receipt.balance.text);
    }
    if (receipt.otherOwed) {
      lines.push(`${receipt.otherOwed.label}: ${receipt.otherOwed.detail}، ${formatMoney(receipt.otherOwed.amount, 'LYD')}.`);
    }
  } else if (receipt.purpose || receipt.category) {
    lines.push(`البيان: ${receipt.purpose ?? receipt.category}`);
  }

  lines.push('');
  if (receipt.number) lines.push(`رقم الإيصال: ${receipt.number}`);
  lines.push(receipt.statusNote, 'نشكر لكم تعاونكم.', '', 'إدارة تاج مول');
  return lines.join('\n');
}

/**
 * The link that opens WhatsApp with a message: to the person's number when it is a valid one, otherwise
 * without a number, where WhatsApp asks who to send it to.
 */
export function buildMessageShareLink(phone: string | null | undefined, message: string): string {
  return (phone ? buildWhatsAppLink(phone, message) : null) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
}
