# Fluxen

> منصة احترافية لإدارة الإيرادات، المصروفات، الخزائن، القيود المحاسبية وإذونات الصرف.
> A premium ERP for revenue & expense management — modelled from a 239-sheet legacy Excel workbook ("منظومة الإيرادات والمصروفات"), rebuilt as a normalised accounting platform.

> ⚠️ **قبل أي نشر أو استخدام إنتاجي**: راجع [`SECURITY.md`](./SECURITY.md) — يحتوي خطوات تدوير مفاتيح
> كانت مكشوفة تاريخياً في هذا المستودع، وهي إلزامية وليست اختيارية.

> 🧭 **الخطة الحالية (نوفمبر 2026)** — ابدأ من [دليل التنفيذ على الكمبيوتر](./docs/EXECUTION-GUIDE-PC-2026-11-15.md)،
> ثم [خطة الإصلاح والتطوير](./docs/REMEDIATION-AND-DEVELOPMENT-PLAN-2026-11-14.md)
> و[معايير الهندسة](./docs/ENGINEERING-STANDARDS-2026-11-14.md)
> و[تصميم العمل دون اتصال](./docs/OFFLINE-MODE-DESIGN-2026-11-14.md).

---

## نظرة عامة

تم تصميم Fluxen بأسلوب editorial light نظيف (لوحة دافئة، خطوط عربية وسيريف لاتيني، حدود رفيعة، حركة هادئة).

النظام يحول 239 ورقة شهرية مكررة في Excel إلى بنية بيانات علائقية واحدة في PostgreSQL، مع الحفاظ على كل منطق العمل المحاسبي.

**ملاحظة مهمة عن البنية الحقيقية**: التطبيق الحالي **مساحة عمل واحدة مشتركة (single-tenant)** —
كل المستخدمين المسجَّلين يرون نفس بيانات "تاج مول"، والفرق بينهم هو الدور (`profiles.role`) لا
مؤسسة منفصلة. القاعدة الفعلية معرَّفة بالكامل عبر ملفات SQL يدوية في `supabase/migrations/`
(انظر `001_init.sql`). هذا يعمل ويُستخدم فعلياً في كل صفحة عبر `@supabase/supabase-js` مباشرة.

## التقنيات

| الطبقة            | التقنية                                                  |
|------------------|-----------------------------------------------------------|
| Framework        | Next.js 16 (App Router) + React 19 + TypeScript           |
| Styling          | Tailwind CSS 4 + shadcn/ui pattern (custom)               |
| Database         | PostgreSQL via Supabase — schema managed by hand-written SQL in `supabase/migrations/` |
| Data access      | `@supabase/supabase-js` مع RLS — لا ORM ولا اتصال مباشر بـ Postgres من التطبيق |
| Auth             | Supabase Auth (SSR)                                       |
| State            | TanStack Query 5 + Zustand                                |
| Tables           | TanStack Table 8                                          |
| Charts           | Recharts                                                  |
| Motion           | Framer Motion (sparingly, server-friendly)                |
| PDF              | @react-pdf/renderer with Arabic shaping                   |
| Desktop          | Tauri 2 (optional)                                        |
| Deployment       | Vercel                                                    |

## التشغيل المحلي

```bash
# 1. تثبيت التبعيات (نسخة مطابقة لـ package-lock) ثم فحص جاهزية الجهاز
npm ci
npm run preflight

# 2. نسخ متغيرات البيئة
cp .env.example .env.local
# املأ DATABASE_URL و NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY
# بقيم حقيقية من مشروعك على Supabase — لا تضع القيم الحقيقية في .env.example نفسه

# 3. طبّق مخطط القاعدة الفعلي (SQL يدوي، بالترتيب، في Supabase → SQL Editor)
# راجع supabase/README.md — هذا هو المخطط الحقيقي الذي يقرأه التطبيق.

# 4. تشغيل التطوير
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000).

> **ملاحظة**: كان في المشروع Prisma بمخطط متعدد المؤسسات لا يطابق القاعدة الفعلية ولا يستعمله التطبيق؛
> أُزيل (يبقى في تاريخ Git). القاعدة الفعلية هي ملفات SQL في `supabase/migrations/` فقط.

## بنية المجلدات

```
src/
  app/                       # Next.js App Router
    (auth)/login/           # تسجيل الدخول
    (app)/                  # كل صفحات التطبيق المحمية
      dashboard/            # لوحة التحكم
      transactions/         # كل المعاملات
      revenues/             # الإيرادات
      expenses/             # المصروفات
      cashboxes/            # الخزائن والمصارف
      accounts/             # دليل البنود
      journals/             # دفتر اليومية
      vouchers/             # إذونات الصرف
      reports/              # ميزان المراجعة، الأرباح والخسائر، التدفقات
      branches/             # الفروع
      users/                # المستخدمون
      roles/                # الصلاحيات
      customers/            # العملاء
      vendors/              # الموردون
      notifications/        # الإشعارات
      activity/             # سجل النشاط
      settings/             # الإعدادات
    api/                    # API routes
      health/               # /api/health
      keepalive/            # /api/keepalive (Vercel cron)
  components/
    ui/                     # primitives (button, card, dialog, table…)
    layout/                 # sidebar, topbar, app-shell, command palette
    brand/                  # logo
    dashboard/              # stat, charts, breakdowns
    data/                   # toolbar, table, empty state
  lib/
    supabase/               # عملاء Supabase (browser, server, admin) — هذا ما يستخدمه التطبيق فعلياً
    constants.ts            # seed templates (categories, cashboxes, roles)
    utils.ts                # formatters (date, money, number, etc.)
    types.ts                # JSON-safe domain types
public/
  favicon.svg
```

## المخطط القاعدي — المصدر الحقيقي

القاعدة الفعلية معرَّفة بالكامل عبر ملفات SQL في [`supabase/migrations/`](./supabase/migrations/)
(تُطبَّق يدوياً عبر Supabase SQL Editor بالترتيب — راجع [`supabase/README.md`](./supabase/README.md)).
أهم الجداول:

- **profiles** — المستخدمون والدور (`owner`/`admin`/`accountant`/`cashier`/`viewer`) — مساحة عمل واحدة مشتركة، لا تعدد مؤسسات
- **branches** — الفروع التابعة
- **categories** — البنود (الإيرادات/المصروفات) — `البند` في النسخة الأصلية
- **cashboxes** — الخزائن النقدية والحسابات المصرفية
- **transactions** — جدول موحد لكل الإيرادات والمصروفات
- **journal_entries / journal_lines** — قيود محاسبة مزدوجة (مدين/دائن)
- **vouchers / voucher_lines** — إذونات الصرف والقبض بقيم فرعية متعددة
- **contacts (customers/vendors/tenants) / employees** — أطراف التعامل
- **lease_contracts / tenant_charges / tenant_charge_allocations** — تقويم إيجار المستأجرين
- **audit_log** — سجل تدقيق شامل
- **app_notifications / attachments / settings**

## نظام التصميم

التصميم يتبع منهج editorial light:

- **لوحة الألوان**: قاعدة دافئة مائلة للبيج (`#FBFBFA`)، حبر دافئ (`#15171A`)، حدود رفيعة (`#ECEAE3`)، ولون brand واحد فقط: أخضر sage عميق (`#2F3D27`) مقتبس من المنظومة الأصلية.
- **الخطوط**: Cairo للنصوص العربية (متغير + إعدادات لكنينغ)، Plus Jakarta Sans لـ UI لاتيني، Instrument Serif للهوية البصرية، JetBrains Mono للأرقام والمراجع.
- **الحركة**: شفافة وقليلة. منحنيات `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quart). تغذية بصرية بحجم 0.985 عند الضغط.
- **الأشكال**: لا توجد ظلال ثقيلة ولا glassmorphism ولا gradient text. الأسطح ورقية، الحدود hairline (1px)، الزوايا 10–12px.
- **التغذية البصرية**: badges على شكل pill مع pastel دافئ (أخضر باهت، أحمر باهت، أصفر باهت...).

## النشر على Vercel

1. ادفع المشروع إلى GitHub.
2. اربط Vercel بالـ repo.
3. أضف متغيرات البيئة من `.env.example`.
4. أمر البناء: `next build` (مُهيّأ في `vercel.json`).
5. الـ keep-alive لا يعتمد على Vercel Cron: يستدعيه GitHub Actions كل 6 ساعات (انظر القسم التالي).

## نظام الـ Keep-Alive

Supabase free-tier يوقف قاعدة البيانات بعد عدم النشاط. النظام يحل ذلك بطبقتين:

1. **GitHub Actions** ([`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml)) كل 6 ساعات →
   ينادي `/api/keepalive` بالسر `KEEPALIVE_SECRET` → يستعلم عن واجهة REST وعن جدول `branches`. إن لم يستجب أي منهما
   يردّ المسار بحالة 503 فيفشل التشغيل ويصلك إشعار GitHub (كان يردّ نجاحاً دائماً حتى مع الانقطاع).
2. **`/api/health`** متاح لخدمات monitoring خارجية مثل UptimeRobot للمراقبة الإضافية (لا يكشف شيئاً).

الـ keepalive يقبل فقط الطلبات التي تحمل `KEEPALIVE_SECRET` (مقارنة بزمن ثابت).

## النسخ الاحتياطي

Supabase Free Tier لا يضمّن نسخاً احتياطية تلقائية. نسخة يومية مضغوطة (`pg_dump`)
تُنشَأ تلقائياً عبر [`.github/workflows/backup.yml`](.github/workflows/backup.yml)
وتُحفظ 30 يوماً كـ GitHub Artifact. التفاصيل وخطوات الاستعادة الكاملة في
[`docs/BACKUP_AND_RESTORE.md`](./docs/BACKUP_AND_RESTORE.md) — يتطلب إضافة
السرّ `DIRECT_URL` في إعدادات المستودع قبل أول تشغيل.

## الترخيص

Proprietary — جميع الحقوق محفوظة.
