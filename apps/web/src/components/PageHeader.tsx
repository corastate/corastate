/**
 * Shared page header used by each product view. Compound shape so callers
 * can drop an actions slot in without a boolean-prop ladder.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = React.HTMLAttributes<HTMLDivElement>;

function PageHeader({ className, children, ...props }: PageHeaderProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1 pb-4 sm:flex-row sm:items-end sm:justify-between', className)} {...props}>
      {children}
    </div>
  );
}

type PageHeaderTitleProps = React.HTMLAttributes<HTMLHeadingElement>;
function PageHeaderTitle({ className, ...props }: PageHeaderTitleProps): JSX.Element {
  return <h2 className={cn('text-2xl font-semibold tracking-tight', className)} {...props} />;
}

type PageHeaderDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;
function PageHeaderDescription({ className, ...props }: PageHeaderDescriptionProps): JSX.Element {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

type PageHeaderActionsProps = React.HTMLAttributes<HTMLDivElement>;
function PageHeaderActions({ className, ...props }: PageHeaderActionsProps): JSX.Element {
  return <div className={cn('flex items-center gap-2', className)} {...props} />;
}

export { PageHeader, PageHeaderTitle, PageHeaderDescription, PageHeaderActions };
