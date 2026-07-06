'use client';

import { useEffect } from 'react';

/**
 * آخر خط دفاع — يُستخدم فقط إن انهار RootLayout نفسه (نادر جداً).
 * يجب أن يعرّف <html>/<body> بنفسه ولا يعتمد على أي مكوّن آخر من
 * التطبيق (خطوط، Tailwind، Providers) لأن السياق الذي فشل قد يكون
 * هو نفسه من يوفّر تلك الاعتماديات.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif',
          background: '#FBFBFA',
          color: '#15171A',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
            تعذّر تشغيل التطبيق
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#5c5f66', margin: '0 0 16px' }}>
            حدث خطأ غير متوقع أثناء تحميل النظام. حاول إعادة التحميل، وإن تكرر الخطأ تواصل مع
            الدعم الفني.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#9a9a9a', margin: '0 0 16px' }} dir="ltr">
              ref: {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 8,
              border: '1px solid rgba(23,23,23,0.1)',
              background: '#171717',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
