import { Loader2 } from 'lucide-react';

export default function ContactDetailLoading() {
  return (
    <div className="flex h-48 items-center justify-center gap-2 text-[13px] text-ink-mute">
      <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
      جارٍ التحميل…
    </div>
  );
}
