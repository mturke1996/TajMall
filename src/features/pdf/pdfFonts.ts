// @ts-nocheck
'use client';

import { Font } from '@react-pdf/renderer';

/**
 * اسم العائلة داخل ملف PDF — متوافق مع كافة تقارير المنظومة
 */
export const PDF_FONT_FAMILY = 'TajMallPdf';

let fontsRegistered = false;

/**
 * تسجيل خطوط اللغة العربية (Tajawal & Cairo) بكافة الأوزان (100 إلى 900) والأنماط (normal/italic)
 * لضمان عدم سقوط react-pdf إلى خط Helvetica غير الداعم للعربية نهائياً في أي بيئة (ويب، ديسكتوب، سيرفر).
 */
export function registerPdfFonts(): void {
  if (fontsRegistered) return;

  try {
    let regularSrc: string;
    let boldSrc: string;

    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin || '';
      regularSrc = origin ? `${origin}/fonts/Tajawal-Regular.ttf` : '/fonts/Tajawal-Regular.ttf';
      boldSrc = origin ? `${origin}/fonts/Tajawal-Bold.ttf` : '/fonts/Tajawal-Bold.ttf';
    } else if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
      // Node.js / Script / Test environment
      const cwd = process.cwd().replace(/\\/g, '/');
      regularSrc = `${cwd}/public/fonts/Tajawal-Regular.ttf`;
      boldSrc = `${cwd}/public/fonts/Tajawal-Bold.ttf`;
    } else {
      regularSrc = '/fonts/Tajawal-Regular.ttf';
      boldSrc = '/fonts/Tajawal-Bold.ttf';
    }

    const fontDefinitions = [
      { src: regularSrc, fontWeight: 100, fontStyle: 'normal' },
      { src: regularSrc, fontWeight: 100, fontStyle: 'italic' },
      { src: regularSrc, fontWeight: 200, fontStyle: 'normal' },
      { src: regularSrc, fontWeight: 200, fontStyle: 'italic' },
      { src: regularSrc, fontWeight: 300, fontStyle: 'normal' },
      { src: regularSrc, fontWeight: 300, fontStyle: 'italic' },
      { src: regularSrc, fontWeight: 400, fontStyle: 'normal' },
      { src: regularSrc, fontWeight: 400, fontStyle: 'italic' },
      { src: regularSrc, fontWeight: 500, fontStyle: 'normal' },
      { src: regularSrc, fontWeight: 500, fontStyle: 'italic' },
      { src: regularSrc, fontWeight: 'normal', fontStyle: 'normal' },
      { src: regularSrc, fontWeight: 'normal', fontStyle: 'italic' },
      { src: boldSrc, fontWeight: 600, fontStyle: 'normal' },
      { src: boldSrc, fontWeight: 600, fontStyle: 'italic' },
      { src: boldSrc, fontWeight: 700, fontStyle: 'normal' },
      { src: boldSrc, fontWeight: 700, fontStyle: 'italic' },
      { src: boldSrc, fontWeight: 800, fontStyle: 'normal' },
      { src: boldSrc, fontWeight: 800, fontStyle: 'italic' },
      { src: boldSrc, fontWeight: 900, fontStyle: 'normal' },
      { src: boldSrc, fontWeight: 900, fontStyle: 'italic' },
      { src: boldSrc, fontWeight: 'bold', fontStyle: 'normal' },
      { src: boldSrc, fontWeight: 'bold', fontStyle: 'italic' },
    ];

    // تسجيل العائلة الرئيسية
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: fontDefinitions,
    });

    // تسجيل أسماء بديلة لتغطية أي مكون قديم
    Font.register({
      family: 'Tajawal',
      fonts: fontDefinitions,
    });

    Font.register({
      family: 'Cairo',
      fonts: fontDefinitions,
    });

    // منع تقطيع الكلمات العربية نهائياً للحفاظ على اتصال الحروف
    Font.registerHyphenationCallback((word) => [word]);

    fontsRegistered = true;
  } catch (e) {
    console.warn('[registerPdfFonts] Warning registering fonts:', e);
  }
}

// تسجيل مبكر
registerPdfFonts();
