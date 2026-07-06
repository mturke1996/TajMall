import Link from 'next/link';
import { Compass } from 'lucide-react';
import { BrandGlyph } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-6 py-16"
      dir="rtl"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="relative">
          <BrandGlyph size={56} className="border border-border/80" />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card">
            <Compass className="h-3.5 w-3.5 text-ink-mute" strokeWidth={2} />
          </span>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">الصفحة غير موجودة</h1>
          <p className="text-sm leading-relaxed text-ink-mute">
            الرابط الذي فتحته غير صحيح، أو تم نقل هذه الصفحة أو حذفها.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-foreground/10 bg-foreground px-4 text-sm font-medium text-background shadow-whisper transition-transform active:scale-[0.97]"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
