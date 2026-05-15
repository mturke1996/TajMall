# PDF — منظومة تاج مول

تصدير تقارير ووثائق بالعربية لهوية تاج مول.

## نظرة عامة

نظام لإنشاء تقارير PDF باللغة العربية مع تصميم متوافق مع الهوية البصرية لـ **منظومة تاج مول**.

## المميزات

- دعم النصوص العربية والأرقام في الوثائق
- غلاف موحّد (`ReportShell`) وهوية من `BRAND` في `src/lib/brand.ts`
- دفتر اليومية، المعاملات، إذن الصرف، وغيرها
- خط Tajawal المسجّل في react-pdf تحت عائلة `TajMallPdf`

## هيكل الملفات (جزئي)

```
src/features/pdf/
├── index.ts
├── pdfFonts.ts
├── prepare-taj-mall-pdf-tree.tsx
├── taj-mall-pdf-toolbar.tsx
├── arabicPDF.ts
├── pdfBase.ts
├── pdfBrandKit.tsx
├── ReportShell.tsx
├── download-button.tsx
├── JournalPDF.tsx
└── README.md
```

## الاستخدام

```tsx
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';

<TajMallPdfToolbar
  fileName="تقرير"
  render={async () => <YourPdfDocument />}
/>
```

## الخطوط

ضع ملفات Tajawal في `public/fonts/`:
- `Tajawal-Regular.ttf`
- `Tajawal-Bold.ttf`
