export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50" dir="rtl">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
            ت
          </div>
          <h1 className="text-2xl font-bold text-slate-900">تاج مول - إعداد النظام</h1>
        </div>

        <div className="space-y-4 text-slate-700">
          <p className="text-lg">
            مرحباً! يبدو أن النظام بحاجة لإعداد متغيرات البيئة (Environment Variables).
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <h2 className="font-semibold text-amber-900 mb-2">المتغيرات المطلوبة على Vercel:</h2>
            <ul className="space-y-2 text-sm text-amber-800 font-mono">
              <li>NEXT_PUBLIC_SUPABASE_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
              <li>SUPABASE_SECRET_KEY</li>
              <li>DATABASE_URL</li>
              <li>KEEPALIVE_SECRET</li>
            </ul>
          </div>

          <div className="bg-slate-100 rounded-md p-4">
            <h2 className="font-semibold text-slate-900 mb-2">خطوات الإعداد:</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
              <li>اذهب إلى <a href="https://supabase.com" className="text-blue-600 hover:underline" target="_blank" rel="noopener">Supabase</a> وأنشئ مشروعاً جديداً</li>
              <li>اذهب إلى إعدادات المشروع → API → انسخ URL والمفاتيح</li>
              <li>في Vercel: اذهب إلى Project Settings → Environment Variables</li>
              <li>أضف المتغيرات المذكورة أعلاه</li>
              <li>أعد نشر المشروع (Redeploy)</li>
            </ol>
          </div>

          <p className="text-sm text-slate-500 pt-4 border-t">
            للمساعدة: راجع ملف <code className="bg-slate-100 px-1 rounded">.env.example</code> في الكود
          </p>
        </div>
      </div>
    </div>
  );
}
