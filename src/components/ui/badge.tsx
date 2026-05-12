import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Pill-shaped editorial badges in warm pastel tones.
 * Strict per minimalist-ui: pale background + dark contextual ink.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.12em] [&>svg]:size-3 [&>svg]:stroke-[1.6]',
  {
    variants: {
      variant: {
        default:    'bg-sage-100 text-sage-700',
        neutral:    'bg-canvas-sunken text-ink-mute border border-border',
        success:    'bg-pastel-green text-pastel-greenInk',
        warning:    'bg-pastel-yellow text-pastel-yellowInk',
        danger:     'bg-pastel-red text-pastel-redInk',
        info:       'bg-pastel-blue text-pastel-blueInk',
        plum:       'bg-pastel-plum text-pastel-plumInk',
        outline:    'border border-border bg-transparent text-ink-mute',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
