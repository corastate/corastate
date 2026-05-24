/**
 * shadcn-style Badge using CVA for tone variants. Tones map to the PDS
 * status scale (critical / high / medium / low / info) for severity, plus
 * a neutral tone for non-status pills. The brand sienna accent is
 * deliberately absent from this surface — status colors stay clear of the
 * accent so a critical alert never reads like a button.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-5 transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-foreground',
        info: 'border-transparent bg-status-info-bg text-status-info-text',
        good: 'border-transparent bg-status-low-bg text-status-low-text',
        warn: 'border-transparent bg-status-high-bg text-status-high-text',
        bad: 'border-transparent bg-status-critical-bg text-status-critical-text',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export { Badge, badgeVariants };
