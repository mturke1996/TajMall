# دفتر اليومية — دليل التشغيل والتكامل

## هجرات Supabase (بالترتيب)

1. `007_create_journal_tables.sql` — الجداول الأساسية
2. `012_connect_journal_to_contacts_and_cashboxes.sql` — جهات وخزائن على البنود
3. `015_auto_journal_reference.sql` — توليد مرجع `JY-YYYY-NNNNN`
4. `016_journal_system_upgrade.sql` — تسلسل ذري، مسودات نماذج، عرض مصدر القيد، نسخ قيد
5. **`017_fix_journal_rpc_and_ledger.sql`** — إصلاح `get_journal_entries_filtered` + `get_general_ledger_lines` (مطلوب إذا ظهر خطأ schema cache)

## التكامل مع المنظومة

| المصدر | `source_type` | الواجهة |
|--------|---------------|---------|
| قيد يدوي | — | `/journals` |
| معاملة إيراد/مصروف | `TRANSACTION` | شارة «مُولَّد من معاملة» |
| مستحقات مستأجر | `TENANT_CHARGE` / … | `/mall/charges` |
| قيد عكسي | `reversal_of_entry_id` | رابط للقيد الأصلي |

بعد **ترحيل** أو **عكس** قيد: تُحدَّث ذاكرة التخزين المؤقت للمعاملات، أرصدة الخزائن، و**دفتر الأستاذ** (`/reports/ledger`).

## الصلاحيات (RBAC)

- `journal.view` — عرض القائمة
- `journal.create` — إنشاء، تعديل مسودة، نسخ، حفظ مسودة نموذج
- `journal.post` — ترحيل
- `journal.reverse` — عكس

## قوالب القيود

تُعرَّف في `src/lib/journal-templates.ts` وتعتمد على **أكواد** البنود في `categories.code` (مثل `AST-CASH`, `REV-RNT`). إن لم تُوجد الأكواد في قاعدة البيانات، يُرفض تطبيق القالب برسالة واضحة.

## مسودات النماذج

جدول `journal_form_drafts` — لكل مستخدم مسوداته (RLS). تُحفظ من نموذج «قيد جديد» ولا تُستبدل القيود المسودة في `journal_entries`.
