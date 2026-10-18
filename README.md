# Fluxen

> منصة احترافية لإدارة الإيرادات، المصروفات، الخزائن، القيود المحاسبية وإذونات الصرف.
> A premium ERP for revenue & expense management — modelled from a 239-sheet legacy Excel workbook ("منظومة الإيرادات والمصروفات"), rebuilt as a normalised accounting platform.

> ⚠️ **قبل أي نشر أو استخدام إنتاجي**: راجع [`SECURITY.md`](./SECURITY.md) — يحتوي خطوات تدوير مفاتيح
> كانت مكشوفة تاريخياً في هذا المستودع، وهي إلزامية وليست اختيارية.

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
| ORM              | ~~Prisma~~ غير مستخدم فعلياً في التطبيق (راجع الملاحظة أدناه) |
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
# 1. تثبيت التبعيات
npm install

# 2. نسخ متغيرات البيئة
cp .env.example .env.local
# املأ DATABASE_URL و NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY
# بقيم حقيقية من مشروعك على Supabase — لا تضع القيم الحقيقية في .env.example نفسه

# 3. طبّق مخطط القاعدة الفعلي (SQL يدوي، بالترتيب، في Supabase → SQL Editor)
# راجع supabase/README.md — هذا هو المخطط الحقيقي الذي يقرأه التطبيق، لا Prisma.
# لا تُشغّل `prisma db push` على قاعدة تحتوي بيانات حقيقية — انظر الملاحظة أدناه.

# 4. تشغيل التطوير
npm run dev
```

افتح [http://localhost:3000](http://localhost:3000).

> **عن Prisma**: `prisma/schema.prisma` و`npm run prisma:studio` مفيدان فقط كأداة تصفّح/فحص محلية
> للقاعدة إن رغبت. لا تُشغّل `npm run prisma:push` على القاعدة الحقيقية — نماذج Prisma (متعددة
> المؤسسات، تسمية camelCase) لا تطابق الجداول الفعلية (`profiles`, `categories`, `cashboxes`...)
> وقد يُنشئ أو يُعدّل جدولاً بشكل غير متوقع. التطبيق لا يستدعي `@prisma/client` في أي مكان فعلي.

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
    prisma.ts               # عميل Prisma — مُعرَّف لكن غير مستدعى من أي كود آخر (dev tool فقط)
    supabase/               # عملاء Supabase (browser, server, admin) — هذا ما يستخدمه التطبيق فعلياً
    constants.ts            # seed templates (categories, cashboxes, roles)
    utils.ts                # formatters (date, money, number, etc.)
    types.ts                # JSON-safe domain types
prisma/
  schema.prisma             # مخطط قديم/تجريبي متعدد المؤسسات — غير مطابق للقاعدة الفعلية، غير مستخدم في التطبيق
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

`prisma/schema.prisma` يحتوي تصميماً أقدم/تجريبياً متعدد المؤسسات (`Organization`, `User`, `Role`…)
لا يطابق الجداول أعلاه ولا يُستخدم في أي استعلام فعلي بالتطبيق — احتفظ به فقط إن رغبت باستخدام
Prisma Studio كأداة تصفّح محلية، وتعامل معه كوثيقة تصميم قديمة لا كمصدر حقيقة.

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
4. أمر البناء: `prisma generate && next build` (مُهيّأ في `vercel.json`).
5. سيتم تفعيل Vercel Cron كل 6 ساعات على `/api/keepalive` تلقائياً.

## نظام الـ Keep-Alive

Supabase free-tier يوقف قاعدة البيانات بعد عدم النشاط. النظام يحل ذلك بطبقتين:

1. **Vercel Cron** كل 6 ساعات → ينادي `/api/keepalive` → يُنفذ `SELECT 1` على قاعدة البيانات.
2. **`/api/health`** متاح لخدمات monitoring خارجية مثل UptimeRobot للمراقبة الإضافية.

كلا المسارين محميان: الـ keepalive يقبل فقط طلبات Vercel Cron أو طلبات تحمل `KEEPALIVE_SECRET`.

## النسخ الاحتياطي

Supabase Free Tier لا يضمّن نسخاً احتياطية تلقائية. نسخة يومية مضغوطة (`pg_dump`)
تُنشَأ تلقائياً عبر [`.github/workflows/backup.yml`](.github/workflows/backup.yml)
وتُحفظ 30 يوماً كـ GitHub Artifact. التفاصيل وخطوات الاستعادة الكاملة في
[`docs/BACKUP_AND_RESTORE.md`](./docs/BACKUP_AND_RESTORE.md) — يتطلب إضافة
السرّ `DIRECT_URL` في إعدادات المستودع قبل أول تشغيل.

## الترخيص

Proprietary — جميع الحقوق محفوظة.
