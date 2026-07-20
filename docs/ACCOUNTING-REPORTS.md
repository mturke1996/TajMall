# المحاسبة والتقارير — Fluxen

## سير العمل

1. **مركز التقارير** (`/reports`) — اختيار سنة/شهر ثم الدخول لأي تقرير
2. **يومية الشهر** (`/reports/journal-month`) — كل قيود الفترة + بنودها + PDF احترافي
3. **دفتر اليومية** (`/journals`) — قيود يدوية أو تلقائية
4. **البنود المحاسبية** (`/accounts`) — دليل الحسابات (إضافة/تعديل بـ `account.manage`)
5. **دفتر الأستاذ** → **ميزان المراجعة** → **الميزانية العمومية**
6. **الأرباح والخسائر** → **التدفقات النقدية** → **أعمار الذمم** → **الفترات المالية**

### فلتر الفترة الموحّد

`?year=2026&month=7` أو `?year=2026&mode=year` — يُمرَّر من المركز إلى صفحات التقارير.

## هجرات Supabase (بالترتيب)

`007` → `012` → `013` → `015` → `016` → `017` → `018` → **`019_manual_allocations_and_notifications.sql`**

### ما تضيفه 019

- **تخصيص يدوي** للتحصيل على مطالبات محددة (`apply_charge_allocations`)
- عمود `auto_allocate_charges` على المعاملات (FIFO أو يدوي)
- **مركز الإشعارات** + `sync_overdue_charge_notifications`
- **PDF**: الميزانية، أعمار الذمm، فاتورة مطالبة

## الربط بين الصفحات

| من | إلى |
|----|-----|
| ميزان المراجعة / الميزانية | دفتر الأستاذ |
| دفتر الأستاذ (رقم القيد) | `/journals?highlight=` |
| أعمار الذمم | `/contacts/[tenant]` · `/mall?tab=charges` |
| إذن صرف جديد | خزينة + بند مصروف → يومية |

## RPC المطلوبة

- `get_balance_sheet`, `get_tenant_ar_aging`
- `get_trial_balance`, `get_profit_loss`, `get_cash_flow`
- `get_general_ledger_lines`, `get_journal_entries_filtered`
- `get_journal_entries_for_period` (هجرة `057`) — يومية الشهر؛ مع fallback على الـ view
- `backfill_existing_transactions_to_ledger`
