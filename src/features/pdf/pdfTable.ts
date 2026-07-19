/**
 * تخطيط جداول PDF مع react-pdf / Yoga
 *
 * مهم: Yoga لا يعكس محور flex عند `direction: 'rtl'` كالمتصفح.
 * لذلك صفوف الجداول تُرسم دائماً بـ LTR فيزيائياً:
 *   أول عنصر في JSX = أقصى اليسار
 *   آخر عنصر في JSX = أقصى اليمين
 *
 * لجداول المحاسبة العربية (القراءة من اليمين):
 *   التاريخ / الرمز يكون آخر عمود في JSX (يمين الورقة)
 *   الرصيد / المبلغ الإجمالي يكون أول عمود (يسار الورقة)
 *   ترتيب JSX النموذجي: [رصيد] [دائن] [مدين] [بيان…] [تاريخ]
 */

export const PDF_TABLE_ROW = {
  direction: 'ltr' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

/** محاذاة نص عربي داخل خلية جدول */
export const PDF_AR_CELL = {
  direction: 'rtl' as const,
  textAlign: 'right' as const,
};

/** مبالغ وأرقام — دائماً LTR داخل الخلية */
export const PDF_NUM_CELL = {
  direction: 'ltr' as const,
  textAlign: 'center' as const,
};
