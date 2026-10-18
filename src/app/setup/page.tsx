import { redirect } from 'next/navigation';

/**
 * Shown only when Supabase browser env is missing at runtime.
 * If vars are configured (after Vercel redeploy), `/` opens the real app —
 * hitting `/setup` directly should not trap users forever.
 */
export default function SetupPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && key) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-canvas-sunken" dir="rtl">
      <div className="max-w-lg w-full bg-card rounded-lg border border-border shadow-lift p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center text-white font-bold text-xl">
            ت
          </div>
          <h1 className="text-2xl font-bold text-foreground">تاج مول - إعداد النظام</h1>
        </div>

        <div className="space-y-4 text-ink-soft">
          <p className="text-lg">
            مرحباً! يبدو أن النظام بحاجة لإعداد متغيرات البيئة (Environment Variables).
          </p>

          <div className="bg-warning-soft border border-warning-line rounded-md p-4">
            <h2 className="font-semibold text-warning-ink mb-2">المتغيرات المطلوبة على Vercel:</h2>
            <ul className="space-y-2 text-sm text-warning-ink font-mono">
              <li>NEXT_PUBLIC_SUPABASE_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY أو NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
              <li>SUPABASE_SECRET_KEY</li>
              <li>DATABASE_URL</li>
              <li>KEEPALIVE_SECRET</li>
            </ul>
          </div>

          <div className="bg-muted rounded-md p-4">
            <h2 className="font-semibold text-foreground mb-2">خطوات الإعداد:</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-ink-soft">
              <li>اذهب إلى <a href="https://supabase.com" className="text-info hover:underline" target="_blank" rel="noopener">Supabase</a> وأنشئ مشروعاً جديداً</li>
              <li>اذهب إلى إعدادات المشروع → API → انسخ URL والمفاتيح</li>
              <li>في Vercel: اذهب إلى Project Settings → Environment Variables</li>
              <li>أضف المتغيرات المذكورة أعلاه</li>
              <li>أعد نشر المشروع (Redeploy)</li>
            </ol>
          </div>

          <p className="text-sm text-muted-foreground pt-4 border-t">
            للمساعدة: راجع ملف <code className="bg-muted px-1 rounded">.env.example</code> في الكود
          </p>
        </div>
      </div>
    </div>
  );
}
