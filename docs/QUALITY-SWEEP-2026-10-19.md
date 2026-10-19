# فحص الجودة والسلاسة — 19 أكتوبر 2026

نُفِّذ بتسعة وكلاء بحث (واحد لكل منطقة من التطبيق)، ثم تحقّق وكيل متشكّك من كل منطقة وحاول نقض كل ملاحظة، ثم أصلح وكيل لكل مجموعة ملفات منفصلة وراجع وكيل آخر كل تعديل، ثم راجعتُ أنا الفروق كلها وأكملتُ الأجزاء التي منعتها حدود الملفات.

- أُبلغ عن **73** ملاحظة، ثبتت منها **64**، وسقطت **9** (لم تثبت أو لا تُعالج بالكود وحده).
- لا تغيير في قاعدة البيانات. الواجهة تعمل بالترحيلات المقترحة وبدونها.

## ما أُصلح (مختصراً)

- **أخطاء التحميل لم تعد تظهر أصفاراً:** المعاملات والإيرادات والمصروفات ولوحة التحكم ونظرة المحلات والمستأجرون وجدول الإيجار في ملف المستأجر وميزانية التقدير والتحصيلات في قيد الفترة؛ كلها تعرض الآن «تعذّر التحميل» مع إعادة المحاولة بدل «لا توجد بيانات» أو صفر.
- **أرقام صحيحة:** مجاميع الإيرادات والمصروفات بلا اختصار (1.2M)، «هذا الشهر» في لوحة التحكم لا يعرض أرقام الشهر السابق، نسب أعلى المصروفات من إجمالي المصروفات لا من الستة الظاهرة، تحصيل الإيجار السنوي بعد ألف سطر، مجاميع الربع والسنة لا تظهر قبل وصول كل الأشهر، وبحث/تصفية المعاملات والسجل لا يحذف ما بعد الألف.
- **أمان العمليات المالية:** تأكيد قبل اعتماد إذن الصرف (يخرج المبلغ من الخزينة)، لا بند مصروف افتراضي صامت في إذن الصرف، تأكيد قبل تغيير الرصيد الافتتاحي أو عملة خزينة، تأكيد قبل إزالة جدول أسعار مستأجر، منع تسجيل الراتب مرتين بنقرتين، تحذير عند قبض إيجار بلا مستأجر، إنهاء العقد يسمّي العقد ويُخفى عمن لا صلاحية له ويتحقق أن التعديل تم فعلاً، إغلاق الفترات المالية لمن يملك صلاحية الترحيل فقط.
- **إدخال المبالغ:** الأرقام العربية و«250,5» تُقرأ صحيحاً في تحويل الخزائن وشاشات الرواتب بدل حذفها أو تضخيمها عشرة أضعاف.
- **سلاسة:** حفظ بحث وتصفية وفترة قائمة المستأجرين عند الرجوع من ملف مستأجر، انتظار توقف الكتابة قبل البحث في اليومية، قوائم الخزينة والمطالبات والفواتير بصفحات بدل رسم الآلاف مرتين، تصدير PDF اليومية بطلب مجمّع بدل طلب لكل قيد، إشعارات جديدة بتنبيه واحد لا عدة، تحديث قائمة المستأجرين فور إضافة أو تعديل جهة، مركز الوثائق يعدّ الصفوف بدل تنزيل القوائم، اختصار Ctrl+K يعمل مع لوحة المفاتيح العربية.
- **نوافذ الإدخال:** النقر خارج نافذة المعاملة أو قيد اليومية لم يعد يمحو ما كُتب، وزر «الموازنة التلقائية» لا يزيد الفرق، والبحث في الحساب لا يغيّر ما تعرضه القوائم الأخرى.
- **صياغة ومظهر:** ترقيم عددي صحيح (خزينة واحدة/خزينتان…)، تقويم الإيجار في الوضع الليلي، رسائل أخطاء استعادة كلمة المرور بالعربية، تنبيه أن إيصال القبض وثيقة للطباعة فقط ولا يسجّل مبلغاً، عدم طلب إذن الإشعارات من المتصفح بلا ميزة تستخدمه.

## قرارات تحتاج رأيك

- **تعيين كلمة مرور مستخدم آخر:** المسار على الخادم موجود (`/api/admin/reset-password`) ولا شاشة له. أضفتُ زراً في شاشة المستخدمين **للمالك فقط**. الذي لم أفعله: السماح للمدير بذلك، لأن المسار يسمح للمدير بتغيير كلمة مرور مدير آخر بلا سجل تدقيق، وهذا قرار صلاحيات لك. (يمكن تقييد المسار نفسه بالمالك إن رغبت.)
- **رابط بوابة المستأجر لا يُلغى ولا يتجدد:** إن أُرسل لرقم خطأ لا سبيل لإبطاله إلا بإيقاف المستأجر. يحتاج عمودين وإجراءً في القاعدة (يُؤجَّل إلى ما بعد 078).
- **سجل التدقيق:** عوامل «حذف» والبحث تنظر في الخمسين المحمّلة فقط؛ التصفية الكاملة تحتاج معاملات في دالة `get_audit_log_feed` (تغيير في القاعدة).

## مؤجَّل (أولوية منخفضة)

- `src/app/(app)/transactions/page.tsx` — Transactions PDF subtitle starts with a digit, omits the period, and file names contain English words
- `src/components/tenants/tenant-profile-sidebar.tsx` — The tenant portal link card is shown to roles that the database refuses
- `src/components/tenants/tenants-directory.tsx` — Tenant list header and period labels use wrong Arabic number agreement («5 مستأجر»، «12 أشهر»)
- `src/components/mall/panels/tenants-panel.tsx` — Tenants rent PDF subtitle starts with a digit and uses a wrong count form ("68 مستأجر")
- `src/components/mall/panels/overview-panel.tsx` — Overview copy: "12 عقد نشط" and dual verbs do not agree with their counts
- `src/components/mall/panels/employees-panel.tsx` — A failed employee-summary load looks like 'no employees yet' and offers to add them again
- `src/components/contacts/contacts-directory.tsx` — Result count under the people list reads '3 جهة' / '5 جهة' (wrong number agreement)
- `src/lib/db/notification-queries.ts` — Marking notifications as read fails silently (no error message, no feedback)
- `src/components/layout/sidebar.tsx` — Desktop sidebar shows six bare section headings with no items on every full load until the profile arrives
- `src/components/dashboard/dashboard-new-features.tsx` — Dashboard footer counts do not agree with their nouns ("3 مسودة", "1 قيد مرحّل")
- `src/app/portal/[token]/page.tsx` — Portal shows not-yet-due charges and months as red 'unpaid' and counts them in 'مستحق N' while the total excludes them
- `src/app/portal/[token]/page.tsx` — Portal total drops service, fine and other charges that fall in a rent-exempt month
- `src/lib/supabase/middleware.ts` — Every page navigation waits on a Supabase Auth network call in the proxy (getUser) where a local JWT check is enough
- `src/lib/db/queries.ts` — Dashboard cash KPI: second request waits behind all transaction pages, duplicates useCashboxBalances, and its error is dropped
- `src/lib/db/payroll-queries.ts` — Payroll failures show raw English backend text in the Arabic toast (e.g. «TypeError: Failed to fetch»)
- `src/lib/db/document-queries.ts` — Editing a receipt voucher deletes its lines before inserting the new ones

## مزايا مقترحة من الكشّاف (لم تُنفَّذ بعد)

1. **تحصيل الإيجار وتذكير المتأخرين من قائمة المستأجرين مباشرة** — جهد m
2. **حواجز أمان عند الإدخال: تنبيه التكرار، رقم الصك والحوالة، بند صريح، بيان تلقائي** — جهد m
3. **إيصال رسمي من الدفعة المرحّلة نفسها بعد التحصيل ومن صفوف الإيرادات (عرض ومشاركة)** — جهد m
4. **تشغيل فوترة الشهر بمعاينة وتذكير في لوحة التحكم** — جهد s
5. **كشف الخزينة اليومي للطباعة، وتجميع العدّ بالفئات، وملخص اليوم للمالك على واتساب** — جهد m
6. **إدخال أسرع: بحث بالاسم والمحل، ذاكرة المورد (آخر بند ومبلغ)، وزر «كرّر المعاملة»** — جهد m
7. **مستحقات المؤجرين على المول هذا الشهر (التزامات الدفع) في لوحة التحكم وتبويب المؤجرين** — جهد m
8. **تصفية الإخلاء قبل إنهاء العقد: المتأخرات والتأمين والصافي، ثم رد التأمين بقيد صحيح** — جهد m

نُفِّذ منها كشف الخزائن اليومي (من الاقتراح الخامس) في نفس الجولة.
