// @ts-nocheck
/**
 * نصوص PDF والعربية
 *
 * في debtflow-pro تُكتب الجمل العربية مباشرة داخل `<Text>` مع خط Tajawal (مسجَّل في react-pdf تحت اسم عائلة مثل Cairo أو TajMallPdf)،
 * دون «تشكيل يدوي + عكس» — react-pdf يضمّن الخط ويعرض Unicode المنطقي بشكل صحيح.
 *
 * النسخة السابقة من `ar()` كانت تعيد تشكيل الحروف وعكس الترتيب، فظهر النص كرموز غير مقروءة
 * عند استخدام Tajawal (تضارب بين أشكال العرض والخط الحقيقي).
 */

/**
 * للعرض داخل مكوّنات @react-pdf/renderer: أعد النص كما هو (أو سلسلة الأرقام).
 */
export function ar(text: string | number | null | undefined): string {
  if (text == null) return '';
  return String(text);
}

/**
 * تنسيق المال بالدينار الليبي
 */
export function arMoney(amount: number, currency = 'د.ل'): string {
  const formatted = new Intl.NumberFormat('en-US').format(Math.round(amount || 0));
  return `${formatted} ${currency}`;
}

/**
 * مبلغ + عملة بترتيب «الرقم ثم العملة» داخل سياق RTL في react-pdf؛ يمنع انقلاب ترتيب البيدي للعملات العربية.
 */
export function ltrAmountCurrency(amount: number, currency = 'د.ل'): string {
  const formatted = new Intl.NumberFormat('en-US').format(Math.round(amount || 0));
  const curr = String(currency ?? '').trim();
  return `\u202A${formatted}\u00A0${curr}\u202C`;
}

/**
 * تنسيق التاريخ DD/MM/YYYY
 */
export function arDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** تاريخ طويل بالعربية للتقارير الرسمية */
export function arDateFormal(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('ar-LY-u-ca-gregory', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return arDate(d);
  }
}

/** تاريخ مختصر للسطر الرسمي (بدون اسم اليوم) */
export function arDateMedium(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('ar-LY-u-ca-gregory', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return arDate(d);
  }
}

/** تاريخ ميلادي يوم/شهر/سنة إنجليزي قصير — يُعرض بجانب العربية في الوثائق الرسمية */
export function arDateGregorianShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return arDate(d);
  }
}

/** صيغة ISO للتاريخ yyyy-mm-dd (محايدة للعروض الثانوية) */
export function arDateIso8601Date(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * أجزاء التاريخ منفصلة لتصميم بطاقة فاخرة:
 * — رقم اليوم بأرقام لاتينية كبيرة (مثل الوثائق البنكية الدولية)
 * — اسم اليوم بالعربية كعنوان فرعي
 * — الشهر والسنة معاً
 * — السطر الميلادي المختصر للأسفل
 */
export function arDateParts(date: Date | string): {
  day: string;
  weekday: string;
  monthYear: string;
  gregorian: string;
} {
  const d = typeof date === 'string' ? new Date(date) : date;
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  try {
    const day = new Intl.DateTimeFormat('ar-LY-u-ca-gregory-nu-latn', {
      day: 'numeric',
    }).format(safe);
    const weekday = new Intl.DateTimeFormat('ar-LY-u-ca-gregory', {
      weekday: 'long',
    }).format(safe);
    const monthYear = new Intl.DateTimeFormat('ar-LY-u-ca-gregory-nu-latn', {
      month: 'long',
      year: 'numeric',
    }).format(safe);
    return {
      day,
      weekday,
      monthYear,
      gregorian: arDate(safe),
    };
  } catch {
    return {
      day: String(safe.getDate()),
      weekday: '',
      monthYear: `${safe.getMonth() + 1}/${safe.getFullYear()}`,
      gregorian: arDate(safe),
    };
  }
}
