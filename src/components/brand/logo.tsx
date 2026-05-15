'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** Circular logo or monogram fallback — reuse in top bar, PWA hints, etc. */
export function BrandGlyph({
  size = 36,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const monoSize = Math.round(size * 0.45);

  if (!imgFailed) {
    return (
      <span
        className={cn(
          'relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-border shadow-whisper',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={BRAND.logoSrc}
          alt=""
          width={size}
          height={size}
          className="object-cover"
          onError={() => setImgFailed(true)}
          priority={priority}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground ring-1 ring-border',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span className="leading-none" style={{ fontSize: monoSize }}>
        {BRAND.monogram}
      </span>
    </span>
  );
}

/**
 * Brand wordmark — Taj Mall circular logo when available, monogram fallback.
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

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandGlyph size={dim} priority={size !== 'sm'} />
      <div className="flex min-w-0 flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {BRAND.name}
        </span>
        {showTagline && (
          <span className="mt-1 text-[11px] text-muted-foreground">{BRAND.tagline}</span>
        )}
      </div>
    </div>
  );
}
