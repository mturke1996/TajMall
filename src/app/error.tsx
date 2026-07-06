'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[root-error]', error);
  }, [error]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-6 py-16"
      dir="rtl"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
          <AlertTriangle className="h-6 w-6 text-rose-600" strokeWidth={2} />
        </span>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">حدث خطأ غير متوقع</h1>
          <p className="text-sm leading-relaxed text-ink-mute">
            تعذّر تحميل هذه الصفحة. حاول مرة أخرى، وإن تكرر الخطأ أعد فتح التطبيق من جديد.
          </p>
          {error.digest ? (
            <p className="pt-1 font-mono text-[11px] text-ink-mute/70" dir="ltr">
              ref: {error.digest}
            </p>
          ) : null}
        </div>

        <button
          onClick={() => reset()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-foreground/10 bg-foreground px-4 text-sm font-medium text-background shadow-whisper transition-transform active:scale-[0.97]"
        >
          <RotateCw className="h-4 w-4" />
          حاول مرة أخرى
        </button>
      </div>
    </div>
  );
}
