'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandGlyph } from '@/components/brand/logo';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app-error]', error);
  }, [error]);

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16"
      dir="rtl"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-rose-500/10 blur-md" />
          <BrandGlyph size={56} className="relative z-10 border border-border/80" />
          <span className="absolute -bottom-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" strokeWidth={2} />
          </span>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">حدث خطأ غير متوقع</h1>
          <p className="text-sm leading-relaxed text-ink-mute">
            لم تُفقد بياناتك — حدث عطل مؤقت في عرض هذه الصفحة فقط. حاول مرة أخرى، وإن تكرر
            الخطأ تواصل مع الدعم الفني مع ذكر الوقت الحالي.
          </p>
          {error.digest ? (
            <p className="pt-1 font-mono text-[11px] text-ink-mute/70" dir="ltr">
              ref: {error.digest}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={() => reset()} className="touch-manipulation">
            <RotateCw className="h-4 w-4" />
            حاول مرة أخرى
          </Button>
          <Button variant="outline" asChild className="touch-manipulation">
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              العودة للوحة التحكم
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
