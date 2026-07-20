# النسخ الاحتياطي والاستعادة (Backup & Restore)

## لماذا هذا الملف ضروري

Supabase Free Tier **لا يضمن نسخاً احتياطية تلقائية** (PITR غير متاح إلا في خطط
Pro وأعلى). بما أن هذا النظام يحمل بيانات مالية حقيقية، الاعتماد على توفّر
Supabase وحده دون نسخة احتياطية مستقلة خطر حقيقي: خطأ بشري واحد (حذف جدول،
`UPDATE` بلا `WHERE`، هجرة SQL خاطئة) قد لا يمكن التراجع عنه.

الحل المُطبَّق هنا: نسخة احتياطية تلقائية **يومية** عبر GitHub Actions —
مجانية بالكامل، لا تحتاج خدمة تخزين خارجية.

## كيف يعمل النسخ الاحتياطي التلقائي

الملف [`.github/workflows/backup.yml`](../.github/workflows/backup.yml):

1. يعمل تلقائياً كل يوم في 02:00 (بتوقيت UTC)، أو يدوياً من تبويب **Actions**
   → **Database Backup** → **Run workflow**.
2. يستخدم `pg_dump` للاتصال المباشر (`DIRECT_URL`) وتصدير نسخة كاملة من
   قاعدة البيانات بصيغة مضغوطة (`custom format`).
3. يرفع الملف كـ **Artifact** في نفس تشغيل الـ workflow، ويُحتفظ به 30 يوماً
   تلقائياً ثم يُحذف (حدود GitHub الافتراضية — قابلة للتعديل في الملف نفسه
   عبر `retention-days`، بحد أقصى 90 يوماً على الخطة المجانية لـ GitHub).

### إعداد لازم قبل أول تشغيل

أضف السرّ التالي في **Settings → Secrets and variables → Actions** بالمستودع:

| السرّ        | القيمة                                                                 |
|-------------|-------------------------------------------------------------------------|
| `DIRECT_URL` | من Supabase Dashboard → Settings → Database → Connection string → **Direct connection** (نفس القيمة المستخدمة محلياً في `.env.local`) |

بدون هذا السرّ سيفشل الـ workflow بوضوح مع رسالة توضيحية، لا صمتاً.

## كيف تسترجع نسخة احتياطية

### 1. تحميل الملف

Actions → **Database Backup** → اختر تشغيلاً ناجحاً → **Artifacts** → نزّل
`fluxen-backup-<التاريخ>.zip` وفُك ضغطه (يحتوي ملف `.dump` واحد).

### 2. الاستعادة على قاعدة بيانات جديدة (الأسلوب الموصى به)

**لا تستعد مباشرة على قاعدة الإنتاج الحالية إلا إذا كنت متأكداً تماماً** —
`pg_restore` بلا حذر يمكن أن يُكرِّر البيانات أو يتعارض مع الموجود. الأسلوب
الأسلم:

```bash
# 1. أنشئ مشروع Supabase جديد (أو قاعدة بيانات محلية فارغة للفحص أولاً)
# 2. استعد النسخة إليها
pg_restore \
  --no-owner --no-privileges \
  -d "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  fluxen-backup-2026-07-07T02-00-00Z.dump

# 3. راجع البيانات في القاعدة الجديدة، ثم فقط بعد التأكد بدّل
#    متغيرات البيئة (DATABASE_URL / DIRECT_URL) على Vercel لتشير إليها.
```

### 3. الاستعادة الجزئية (جدول واحد فقط)

```bash
# اعرض قائمة الجداول/الكائنات داخل النسخة
pg_restore -l fluxen-backup-2026-07-07T02-00-00Z.dump > toc.txt

# عدّل toc.txt لإبقاء الجدول المطلوب فقط، ثم:
pg_restore --no-owner --no-privileges -L toc.txt -d "<connection-string>" fluxen-backup-....dump
```

## التوصية للمدى الطويل

إن انتقل المشروع لخطة **Supabase Pro** فعِّل:

- **Point-in-Time Recovery (PITR)** — استرجاع لأي لحظة خلال آخر 7–30 يوماً،
  أدق وأسرع من `pg_dump` اليومي.
- **Daily backups** المدمجة في لوحة Supabase نفسها.

نسخة GitHub Actions هنا تبقى مفيدة كطبقة ثانية مستقلة (لو تعطّل حساب Supabase
نفسه أو حُذف المشروع بالخطأ) حتى بعد الترقية.

## اختبار دوري (مهم)

نسخة احتياطية لم تُختبَر استرجاعها = لا نسخة احتياطية فعلياً. يُستحسن كل
شهرين تقريباً تحميل آخر نسخة وتجربة استعادتها على قاعدة فارغة للتأكد أن
العملية تعمل بالكامل.

---

## النسخ الاحتياطي المحلي البارد (تطبيق سطح المكتب Tauri)

طبقة **مستقلة** عن GitHub Actions: لقطة كاملة لبيانات الأعمال تُحفظ على جهاز
التشغيل داخل تطبيق **Taj Mall** (Tauri).

| | |
|--|--|
| **المكان** | `%APPDATA%\ly.tajmall.fluxen\backups\` (Windows) |
| **الملفات** | `{id}.sqlite` + `{id}.zip` (JSON محمول) لكل لقطة |
| **متى** | زر «إنشاء نسخة» من `/settings/backup`، أو تلقائياً عند فتح التطبيق (مرة كل 24 ساعة كحد أقصى) |
| **الصلاحية** | `owner` / `admin` فقط |
| **الاستخدام اليومي** | **لا** — التطبيق لا يقرأ من هذه الملفات؛ Supabase يبقى مصدر الحقيقة |

### ماذا يحتوي الأرشيف ZIP؟

- `manifest.json` — المعرّف، الوقت، أعداد الصفوف، checksum
- `tables/<table>.json` — كل صفوف الجدول (`select *`) بنفس جودة البيانات الحية

### استعادة طارئة لاستضافة / مشروع Supabase آخر

1. أنشئ مشروعاً جديداً وطبق عليه هجرات `supabase/migrations`.
2. أنشئ مستخدمي Auth المطابقين لصفوف `profiles` إن أمكن (أو تجاهل أخطاء FK على `profiles`).
3. من جهاز فيه Node و`DIRECT_URL` للقاعدة **الجديدة**:

```bash
# PowerShell
$env:DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
npm run backup:restore-cold -- path\to\fluxen-cold-backup-XXXX.zip
```

السكربت: [`scripts/restore-cold-backup.mjs`](../scripts/restore-cold-backup.mjs).

هذا مسار **هجرة / كارثة** فقط — ليس بديلاً عن العمل اليومي على Supabase.
