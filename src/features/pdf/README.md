# Fluxen PDF System

نظام PDF احترافي لمنظومة الإيرادات والمصروفات - Fluxen

## نظرة عامة

نظام متكامل لإنشاء تقارير PDF باللغة العربية مع تصميم احترافي متوافق مع الهوية البصرية لـ Fluxen.

## المميزات

- ✅ **دعم كامل للغة العربية** - معالجة صحيحة للنصوص العربية والأرقام
- ✅ **تصميم احترافي** - هوية بصرية موحدة بألوان Sage Green
- ✅ **تصدير PDF للقيود** - دفتر اليومية مع العربية والهوية
- ✅ **خط Tajawal** - خط عربي أنيق ومهني
- ✅ **متوافق مع React-PDF** - يستخدم مكتبة @react-pdf/renderer

## هيكل الملفات

```
src/features/pdf/
├── index.ts                 # التصديرات الرئيسية
├── pdfFonts.ts              # تسجيل الخطوط
├── arabicPDF.ts             # معالجة النصوص العربية
├── pdfBase.ts               # الأنماط الأساسية
├── pdfBrandKit.tsx          # Brand Kit كامل
├── ReportShell.tsx          # غلاف المستندات
├── download-button.tsx      # زر التحميل
├── JournalPDF.tsx           # دفتر اليومية
└── README.md                # هذا الملف
```

## الألوان المستخدمة

| اللون | الكود | الاستخدام |
|-------|-------|-----------|
| Sage Green | `#4a5d4a` | اللون الأساسي |
| Sage Light | `#6b7f6b` | لون فاتح |
| Taupe | `#8b7e6a` | لون التأكيد |
| Pale Gold | `#c8c0b0` | لون ذهبي فاتح |
| Success | `#0d9668` | الأخضر |
| Danger | `#d64545` | الأحمر |
| Warning | `#c9a54e` | الأصفر |

## الاستخدام

```tsx
import { DownloadPdfButton } from '@/features/pdf';

<DownloadPdfButton
  fileName="دفتر-اليومية"
  render={async () => {
    const { JournalPDF } = await import('@/features/pdf/JournalPDF');
    return <JournalPDF entries={entries} periodLabel="الفترة الحالية" />;
  }}
>
  طباعة PDF
</DownloadPdfButton>
```

## المتطلبات

يجب وضع ملفات خط Tajawal في `public/fonts/`:
- `Tajawal-Regular.ttf`
- `Tajawal-Bold.ttf`

## الترخيص

© 2024 Fluxen - منظومة الإيرادات والمصروفات
