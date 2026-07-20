# مركز التقارير و يومية الشهر — مواصفة

**الحالة:** معتمد للتنفيذ  
**التاريخ:** 2026-07-20

## الهدف

مركز تقارير كامل (`/reports`) مع فلتر سنة/شهر موحّد، وتقرير «يومية الشهر» يصدّر PDF عالي الجودة لكل القيود وبنودها.

## المعمارية

1. `src/lib/report-period.ts` — تحليل/بناء فترة من URL
2. `ReportPeriodFilter` — واجهة اختيار السنة والشهر
3. `/reports` — بطاقات التقارير + ملخص الفترة
4. `/reports/journal-month` — قائمة + CSV + PDF عبر `JournalPDF` المحسّن
5. `get_journal_entries_for_period` + fallback على `journal_entries_with_totals`

## قرارات

- الترتيب الزمني للقيود في تقرير الشهر (قديم → جديد)
- الحالة الافتراضية: مرحّل فقط
- إزالة redirect `/reports` → ledger
