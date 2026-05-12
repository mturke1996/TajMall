import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Brand wordmark.
 * Rounded sage tile with the brand's Arabic monogram, paired with
 * the bilingual wordmark and tagline. Pure server-renderable.
 */
export function Logo({
  size = 'md',
  showTagline = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
}) {
  const dim = size === 'sm' ? 30 : size === 'lg' ? 44 : 36;
  const monoSize = Math.round(dim * 0.52);

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-md bg-sage-700 text-sand-50 ring-1 ring-sage-800/30"
        style={{ width: dim, height: dim }}
      >
        <span
          className="font-bold leading-none"
          style={{ fontSize: monoSize }}
        >
          {BRAND.monogram}
        </span>
      </span>
      <div className="flex min-w-0 flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {BRAND.name}
        </span>
        {showTagline && (
          <span className="mt-1 text-[11px] text-ink-mute">{BRAND.tagline}</span>
        )}
      </div>
    </div>
  );
}
