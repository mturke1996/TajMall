# دليل نشر القاعدة على Supabase

## 1. نشر المخطط (مرة واحدة)

افتح [supabase.com/dashboard](https://supabase.com/dashboard) → اختر مشروعك → **SQL Editor** → **New query** ثم:

1. افتح ملف [`migrations/001_init.sql`](./migrations/001_init.sql) من هذا المجلد.
2. انسخ كل محتواه.
3. الصقه في SQL Editor.
4. اضغط **Run** (Ctrl+Enter).

ينشئ هذا الملف:
- 5 جداول: `profiles`, `branches`, `categories`, `cashboxes`, `transactions`
- 5 enums (tx_kind, tx_status, payment_method, account_type, cashbox_kind)
- 6 indexes للأداء
- 5 triggers لـ `updated_at` التلقائي
- trigger لإنشاء profile تلقائياً عند تسجيل أي مستخدم جديد
- 4 policies RLS لكل جدول (مستخدم authenticated يقرأ/يكتب/يحدّث/يحذف)
- 18 بنداً افتراضياً + 4 خزائن + فرع رئيسي
- view `cashbox_balances` يحسب الرصيد لحظياً

## 2. إنشاء أول مستخدم

### الطريقة الأسهل (Dashboard)

1. Supabase Dashboard → **Authentication** → **Users**
2. اضغط **Add user** → **Create new user**
3. أدخل البريد وكلمة المرور (✅ Auto Confirm User)
4. اضغط **Create**

سيُنشأ profile تلقائياً للمستخدم بفضل trigger `on_auth_user_created`.

### الطريقة الذاتية (تسجيل عام)

1. **Authentication** → **Providers** → **Email**
2. فعّل **Enable signup**
3. عطّل **Confirm email** للتجربة السريعة
4. اذهب لـ `/login` في تطبيقك وسجّل بريداً جديداً

## 3. التحقق من الإعداد

في SQL Editor جرّب:

```sql
SELECT name_ar, kind FROM public.categories ORDER BY sort_order LIMIT 5;
SELECT name_ar, kind FROM public.cashboxes;
SELECT auth.uid() AS my_user_id;
```

يجب أن ترى البنود الأربعة الأولى ("إيرادات عامة"، "دعم الخزينة"، ...) والخزائن الأربع.

## 4. اختبار التطبيق

```bash
npm run dev
```

1. افتح `http://localhost:3000` → يحوّل لـ `/login`.
2. سجّل دخول بالمستخدم الذي أنشأته.
3. الـ Dashboard يفتح. البنود والخزائن متاحة في القوائم.
4. اضغط **+ معاملة جديدة** → سجّل أول إيراد.
5. المعاملة تظهر فوراً في الـ Dashboard، صفحة الإيرادات، وميزان الخزائن.

## استكشاف الأخطاء

| العَرَض | السبب | الحل |
|------|------|------|
| "relation does not exist" | لم يُنفَّذ ملف SQL | شغّل `001_init.sql` |
| القوائم فارغة بعد الـ SQL | RLS يمنع القراءة (لم تسجّل دخول) | افتح `/login` وسجّل |
| "permission denied for schema public" | لم تُفعَّل RLS بشكل صحيح | أعد تشغيل `001_init.sql` |
| الخزائن تظهر برصيد 0 | لم تُرحَّل معاملات (`status = POSTED`) | أنشئ معاملة جديدة من الـ UI |
