import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type InfoItem = {
  label: string;
  /** null, undefined and empty text show a dash */
  value?: ReactNode;
  /** numbers, codes, phone numbers: kept left-to-right with tabular digits */
  ltr?: boolean;
  href?: string;
};

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === false || (typeof v === 'string' && v.trim() === '');

/** Label and value rows. A missing value is a dash, never a blank. */
export function InfoList({ items, className }: { items: InfoItem[]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-border', className)}>
      {items.map((item) => {
        const empty = isEmpty(item.value);
        // left-to-right text sits in its own isolate so it still starts at the reading edge of the row
        const text = item.ltr && !empty ? (
          <bdi dir="ltr" className="tabular-nums">
            {item.value}
          </bdi>
        ) : (
          item.value
        );
        const value = empty ? (
          <span className="text-ink-mute">
            <span aria-hidden>—</span>
            <span className="sr-only">غير مسجّل</span>
          </span>
        ) : item.href ? (
          // padding and a matching negative margin make the tap area 44px high without growing the row
          <a href={item.href} className="-my-3 inline-block py-3 text-info-ink underline-offset-4 hover:underline">
            {text}
          </a>
        ) : (
          text
        );
        return (
          <div key={item.label} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-baseline gap-x-4 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <dt className="text-[12.5px] text-ink-mute">{item.label}</dt>
            <dd className="min-w-0 break-words text-[13.5px] text-foreground">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
