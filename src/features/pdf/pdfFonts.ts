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
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: `${origin}/fonts/Tajawal-Regular.ttf`, fontWeight: 400, fontStyle: 'normal' },
        { src: `${origin}/fonts/Tajawal-Regular.ttf`, fontWeight: 400, fontStyle: 'italic' },
        { src: `${origin}/fonts/Tajawal-Bold.ttf`, fontWeight: 700, fontStyle: 'normal' },
        { src: `${origin}/fonts/Tajawal-Bold.ttf`, fontWeight: 700, fontStyle: 'italic' },
      ],
    });
    Font.registerHyphenationCallback((word) => [word]);
  } catch {
    /* تسجيل مكرر بعد أول تحميل أو HMR */
  }
}

if (typeof window !== 'undefined') {
  registerPdfFonts();
}
