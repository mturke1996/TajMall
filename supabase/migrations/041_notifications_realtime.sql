-- ============================================================
-- Migration 041: تفعيل Realtime على جدول الإشعارات
-- ============================================================
-- الواجهة كانت تعتمد على سحب يدوي فقط (فتح الصفحة / زر "تحديث").
-- هذا يضيف الجدول لنشرة supabase_realtime حتى تصل الإشعارات الجديدة
-- فوراً لكل من يفتح التطبيق، دون الحاجة لإعادة تحميل الصفحة.
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notifications;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- REPLICA IDENTITY FULL يضمن وصول القيم القديمة والجديدة كاملة مع
-- أحداث UPDATE (مثل تعليم إشعار كمقروء من جهاز آخر).
ALTER TABLE public.app_notifications REPLICA IDENTITY FULL;
