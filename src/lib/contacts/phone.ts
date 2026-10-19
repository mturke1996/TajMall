/**
 * Phone numbers as the mall's people write them: Libyan mobiles (091 2345678), Libyan landlines (021 4801234),
 * the same with +218 or 00218 in front (also with the trunk 0 written after it by habit), Arabic digits, spaces
 * and dashes. A number from another country is kept as it is. Nothing here touches the database or React.
 *
 * The stored form is digits without spaces ("0912345678", "+905551234567"); the shown form has a space after
 * the area or network code ("091 2345678"). A text that is not a number is never thrown away: `canonical`
 * returns it trimmed so an old value survives a save that did not touch it.
 */

export type PhoneKind = 'empty' | 'mobile' | 'landline' | 'international' | 'invalid';

export type ParsedPhone = {
  kind: PhoneKind;
  /** what is stored: 0912345678, +905551234567; for an invalid entry the trimmed text; '' when empty */
  canonical: string;
  /** what is shown: 091 2345678 */
  display: string;
  /** equal for two spellings of the same number; '' unless the number is complete */
  key: string;
  /** a short Arabic reason when the number cannot be right, otherwise null */
  problem: string | null;
};

/** ٠٩١ → 091 (also the Persian digits). */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** What an input keeps while typing: Latin digits and the characters a number is written with. */
export function cleanPhoneInput(raw: string): string {
  return toLatinDigits(raw).replace(/[^\d+\-().\s]/g, '');
}

const MOBILE_PROBLEM = 'رقم الجوال الليبي 10 أرقام ويبدأ بـ 09، مثل 0912345678';
const INCOMPLETE = 'الرقم غير مكتمل';

const result = (kind: PhoneKind, canonical: string, display: string, key: string, problem: string | null = null): ParsedPhone => ({
  kind,
  canonical,
  display,
  key,
  problem,
});

const groupLocal = (national: string) => `0${national.slice(0, 2)} ${national.slice(2)}`;

/** `national` is the number without the country code and without the trunk 0. */
function libyan(national: string, original: string): ParsedPhone {
  if (/^9\d{8}$/.test(national)) return result('mobile', `0${national}`, groupLocal(national), national);
  if (/^[2-8]\d{7,8}$/.test(national)) return result('landline', `0${national}`, groupLocal(national), national);
  // starts like a mobile (09…) but has the wrong number of digits: the usual typing mistake
  if (national.startsWith('9')) return result('invalid', original, original, '', MOBILE_PROBLEM);
  return result('invalid', original, original, '', INCOMPLETE);
}

export function parsePhone(raw: unknown): ParsedPhone {
  const original = toLatinDigits(String(raw ?? '')).trim();
  if (!original) return result('empty', '', '', '');
  if (/[^\d+\-().\s\u200e\u200f]/.test(original)) return result('invalid', original, original, '', 'اكتب أرقاماً فقط');

  const digits = original.replace(/\D/g, '');
  if (!digits) return result('invalid', original, original, '', 'اكتب أرقاماً فقط');

  const plus = original.startsWith('+');
  const international = plus || digits.startsWith('00');
  const body = digits.startsWith('00') ? digits.slice(2) : digits;

  if (international || (body.startsWith('218') && body.length >= 11)) {
    if (body.startsWith('218')) return libyan(body.slice(3).replace(/^0/, ''), original);
    if (body.length >= 8 && body.length <= 15) return result('international', `+${body}`, `+${body}`, body);
    return result('invalid', original, original, '', 'الرقم الدولي غير مكتمل');
  }

  // a local number: with the trunk 0 (0912345678) or without it (912345678)
  return libyan(body.startsWith('0') ? body.slice(1) : body, original);
}

/** The reason a number cannot be right, or null (an empty field is fine: the phone is optional). */
export function phoneProblem(raw: unknown): string | null {
  return parsePhone(raw).problem;
}

/**
 * The value to store. A complete number is written the one way (0912345678); an empty field is null; text that
 * is not a number is kept as typed (trimmed) so saving never erases what an older version of the form accepted.
 */
export function normalizePhoneForSave(raw: unknown): string | null {
  const parsed = parsePhone(raw);
  return parsed.canonical === '' ? null : parsed.canonical;
}

/** The value to show in a field after the person leaves it: a complete number is spaced, anything else is untouched. */
export function displayPhone(raw: unknown): string {
  const parsed = parsePhone(raw);
  return parsed.kind === 'invalid' || parsed.kind === 'empty' ? String(raw ?? '') : parsed.display;
}

/** Compares two spellings of one number ("0912345678", "+218 91 234 5678", "٠٩١٢٣٤٥٦٧٨"); null for an incomplete one. */
export function phoneKey(raw: unknown): string | null {
  const key = parsePhone(raw).key;
  return key === '' ? null : key;
}

/** A short word for the kind of number, shown under the field once it is complete. */
export function phoneKindLabel(kind: PhoneKind): string | null {
  switch (kind) {
    case 'mobile':
      return 'جوال';
    case 'landline':
      return 'هاتف أرضي';
    case 'international':
      return 'رقم دولي';
    default:
      return null;
  }
}
