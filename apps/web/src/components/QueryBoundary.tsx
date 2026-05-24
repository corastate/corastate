/**
 * Tiny wrapper that handles the three states a TanStack Query exposes —
 * pending, error, success — without each view repeating the same trio of
 * branches. Compound shape lets a caller drop a custom skeleton in.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface QueryBoundaryProps {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** Optional refetch handler — shown as a Retry button on error. */
  onRetry?: () => void;
  pendingFallback?: ReactNode;
  children: ReactNode;
}

export function QueryBoundary({
  isPending,
  isError,
  error,
  onRetry,
  pendingFallback,
  children,
}: QueryBoundaryProps): JSX.Element {
  if (isPending) {
    return <>{pendingFallback ?? <SkeletonPending />}</>;
  }
  if (isError) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <Card className="border-status-critical/40" role="alert">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-status-critical" aria-hidden /> Could not load
          </CardTitle>
          <CardDescription>The backend returned an error.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <pre className="overflow-x-auto rounded-md bg-status-critical-bg p-3 font-mono text-xs text-status-critical-text">
            {message}
          </pre>
          {onRetry ? (
            <Button onClick={onRetry} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden /> Retry
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}

function SkeletonPending(): JSX.Element {
  return (
    <div className="space-y-2" role="status" aria-live="polite" aria-label="Loading">
      <div className="h-9 w-full animate-pulse rounded-md bg-muted/60" />
      <div className="h-9 w-full animate-pulse rounded-md bg-muted/60" />
      <div className="h-9 w-full animate-pulse rounded-md bg-muted/60" />
      <div className="h-9 w-full animate-pulse rounded-md bg-muted/60" />
      <div className="h-9 w-full animate-pulse rounded-md bg-muted/60" />
    </div>
  );
}
