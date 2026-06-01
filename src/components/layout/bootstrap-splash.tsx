'use client';

import { Loader2 } from 'lucide-react';
import { BrandGlyph } from '@/components/brand/logo';

/** شاشة تجهيز خفيفة — تظهر مرة واحدة في الجلسة عند أول فتح */
export function BootstrapSplash() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <BrandGlyph size={44} priority />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-sage-700" aria-hidden />
        <span>جاري تجهيز النظام…</span>
      </div>
      <p className="text-center text-xs text-muted-foreground/80 max-w-xs leading-relaxed">
        تحميل البيانات مرة واحدة لتصفح سريع بدون انتظار
      </p>
    </div>
  );
}
