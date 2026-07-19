'use client';

import { Font } from '@react-pdf/renderer';

/**
 * اسم العائلة داخل ملف PDF — ليس اسم الخط الظاهر للمستخدم.
 * غيّرنا الاسم عن «Cairo» حتى لا يبقى في ذاكرة المتصفح/HMR تسجيل قديم بلا نسخة italic.
 */
export const PDF_FONT_FAMILY = 'TajMallPdf';

/**
 * تسجيل Tajawal مع احتياط italic (نفس ملف Regular/Bold) — react-pdf يطلب أحياناً italic + 400.
 * يُستدعى قبل كل توليد PDF؛ التكرار يُتجاهَل بهدوء بعد أول نجاح.
 */
export function registerPdfFonts(): void {
  if (typeof window === 'undefined') return;
  try {
    const origin = window.location.origin;
    // absolute URL يضمن تحميل الخط على Vercel/localhost قبل الرسم
    const regular = `${origin}/fonts/Tajawal-Regular.ttf`;
    const bold = `${origin}/fonts/Tajawal-Bold.ttf`;
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: regular, fontWeight: 400, fontStyle: 'normal' },
        { src: regular, fontWeight: 400, fontStyle: 'italic' },
        { src: bold, fontWeight: 700, fontStyle: 'normal' },
        { src: bold, fontWeight: 700, fontStyle: 'italic' },
        { src: bold, fontWeight: 'bold', fontStyle: 'normal' },
        { src: regular, fontWeight: 'normal', fontStyle: 'normal' },
      ],
    });
    // منع تقطيع الكلمات العربية (يكسر الحروف المتصلة)
    Font.registerHyphenationCallback((word) => [word]);
  } catch {
    /* تسجيل مكرر بعد أول تحميل أو HMR */
  }
}

if (typeof window !== 'undefined') {
  registerPdfFonts();
}
