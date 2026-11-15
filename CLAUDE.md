# تاج مول (Fluxen) — سياق المشروع لـ Claude Code

منظومة محاسبة وإدارة مول تجاري، عربية RTL، **مساحة عمل واحدة مشتركة** (single-tenant: كل المستخدمين يرون بيانات تاج مول، والفرق بالدور).
Next.js 16 (App Router) + React 19 + TypeScript، قاعدة **Supabase** (Postgres + RLS)، وغلاف سطح المكتب **Tauri 2** لويندوز في `src-tauri/`.
لا ORM: التطبيق يتعامل مع القاعدة عبر `@supabase/supabase-js` فقط، والمخطط هو ملفات SQL في `supabase/migrations/`
(لا تعيد بناء الإنتاج حرفياً: انحراف معروف، خط الأساس مخطَّط في الخطة 3.5).

## ابدأ من هنا (بهذا الترتيب)

1. `docs/EXECUTION-GUIDE-PC-2026-11-15.md` — التنفيذ خطوة بخطوة على جهاز الكمبيوتر.
2. `docs/REMEDIATION-AND-DEVELOPMENT-PLAN-2026-11-14.md` — الخطة، **سجل التنفيذ** (ما أُنجز وما بقي)، القرارات المعلّقة (القسم 9)، استعلامات فحص الإنتاج (الملحق أ).
3. `docs/ENGINEERING-STANDARDS-2026-11-14.md` — المعايير، بوابات الجودة، كتيّبات الطوارئ.
4. `docs/OFFLINE-MODE-DESIGN-2026-11-14.md` — تصميم العمل دون اتصال لتطبيق ويندوز.
5. `docs/OWNER-ACTIONS-2026-10-19.md`، `SECURITY.md`، `docs/BACKUP_AND_RESTORE.md`.

## قواعد لا تُكسر

1. **لا إفساد.** لا يُنشر تغيير قبل أن يمر ببروتوكول الخطة الرئيسية (القسم 2 في `MASTER-DEVELOPMENT-PLAN`): تجربة على نسخة معزولة، تراجع مختبَر، وأرقام ذهبية للتقارير.
2. **قاعدة الإنتاج لا تُمسّ من الكود ولا من الوكيل.** كل تغيير عليها = هجرة **مقترحة** في `docs/proposed-migrations/` + ملف `ROLLBACK` + اختبار على النسخة المعزولة (PGlite). التطبيق على الإنتاج بيد المالك، بعد `npm run db:snapshot` والتحقق منه (`--verify-only`).
3. **لا تعديل لبيانات تاريخية** (عقد، دفعة، قيد) دون معاينة بالأرقام وموافقة المالك.
4. **لا أسرار.** لا تعرض محتوى `.env.local` في المحادثة، ولا تكتب مفتاحاً أو كلمة مرور أو رابط قاعدة بيانات في ملف أو commit أو رسالة.
5. **كل إصلاح له اختبار يفشل بدونه** (أثبت ذلك بطفرة: أدخل الخلل وشاهد الفحص يفشل). والاختبار **لا يعتمد على تاريخ اليوم ولا يوم الأسبوع**.
6. **القرارات المعلّقة للمالك** (الخطة القسم 9: تأمين العقد التزام أم إيراد؟ إلغاء بدل حذف؟ الخطة المدفوعة؟ …) لا تُتخذ بدلاً منه.
7. لا طلب دمج ولا تعليق على GitHub إلا إن طُلب صراحةً.

## الأوامر

```bash
npm ci                         # تثبيت مطابق لـ package-lock
npm run preflight              # فحص جاهزية الجهاز (لا يغيّر شيئاً ولا يطبع أسراراً)
npm run ci:local               # نفس فحوص CI على هذا الجهاز؛ --list / --only <جزء> / --with-build / --stop-on-fail
npm run typecheck && npm run lint
npm run dev                    # http://localhost:3000 (يتصل بمشروع Supabase في .env.local: قد يكون الإنتاج!)
npm run test:cold-restore      # الاستعادة الدائرية على نسختين معزولتين (93 فحصاً)
npm run verify:service-worker  # قواعد الـ Service Worker (معزول)
npm run e2e:offline-shell      # القشرة دون اتصال في متصفح حقيقي (يلزم npm run build قبله)
npm run test:desktop           # cargo test للغلاف (يلزم Rust)
```

القاعدة: `npm run db:snapshot` (نسخة للقراءة فقط إلى `~/Fluxen-Backups`)، `npm run audit:integrity` و`audit:security` (قراءة فقط)، `node scripts/apply-proposed-migrations.mjs --confirm [--only 078]` (**يكتب على الإنتاج**: للمالك وحده).

## ملاحظات تشغيلية (حدثت فعلاً)

- `npx` قد يجلب نسخاً غير المثبّتة: استعمل `npm run <سكربت>` أو `node_modules/.bin/<أداة>`.
- اختبارات القاعدة القديمة تعتمد على التاريخ (دَين N-16): CI يبدأ الساعة من 2026-11-16 بـ `libfaketime`. من 2027-01-01 يفشل `test:hardening` و`verify:rent-allocation` على جهاز بلا ساعة ثابتة، وهذا ليس تراجعاً.
- مجلد `.next` قديم بعد حذف مسار يكسر `tsc` محلياً حتى يُعاد البناء؛ CI يبدأ نظيفاً.
- اختبارات Rust: `cd src-tauri && cargo test --locked`؛ على لينكس تلزم مكتبات Tauri (`libwebkit2gtk-4.1-dev` وغيرها).
- الغلاف يحمّل موقع الإنتاج: صلاحيات الأوامر مقصورة على نطاقه (`src-tauri/capabilities/default.json`)، وملف `dev.json` لـ localhost لا يُشحن ويُفعَّل بـ `npm run tauri:dev` فقط.
- كل ملفات المستودع LF (`.gitattributes`).

## أين الكود

- `src/app/(app)/` صفحات التطبيق (قشور بلا جلب بيانات على الخادم: فحص آلي يحرس ذلك)، `src/app/api/` المسارات، `src/lib/` المنطق، `src/components/` الواجهة.
- `scripts/` الفحوص والاختبارات وأدوات القاعدة، `docs/proposed-migrations/` الهجرات المقترحة (لم تُطبَّق على الإنتاج ما لم يؤكد المالك).
- `src-tauri/` غلاف ويندوز: `src/backup/mod.rs` (النسخ البارد) و`src/lib.rs` (الأوامر والمصافحة).
