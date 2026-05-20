/**
 * shadcn-style Badge using CVA for tone variants. Used for source pills,
 * health flags, and source-status indicators across the product views.
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
        info: 'border-transparent bg-secondary text-secondary-foreground',
        good: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
        warn: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
        bad: 'border-transparent bg-destructive/15 text-destructive dark:text-destructive-foreground',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export { Badge, badgeVariants };
