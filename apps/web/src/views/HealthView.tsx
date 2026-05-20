/**
 * System-health view. The diagnostic surface that proves the wire from
 * React → Fastify → Postgres. Used during install + on-call. Replaces the
 * pre-Week-4 `App.tsx` health card and the manual useState/useEffect
 * pattern with a TanStack Query call.
 */

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/PageHeader';
import { QueryBoundary } from '@/components/QueryBoundary';
import { healthQuery } from '@/lib/api';

export function HealthView(): JSX.Element {
  const { data, isPending, isError, error, isFetching, refetch } = useQuery(healthQuery());
  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <PageHeaderTitle>System health</PageHeaderTitle>
          <PageHeaderDescription>
            Backend reachability and database connectivity. Drives the on-call diagnostic flow.
          </PageHeaderDescription>
        </div>
        <PageHeaderActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            data-testid="health-refresh"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <QueryBoundary isPending={isPending} isError={isError} error={error} onRetry={() => void refetch()}>
        {data ? (
          <Card data-testid="health-card">
            <CardHeader>
              <CardTitle>Backend</CardTitle>
              <CardDescription>From /internal/healthz.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Status" value={data.status} />
              <Row label="Database" value={data.db} />
              <Row label="Uptime" value={`${data.uptime.toFixed(0)}s`} />
            </CardContent>
          </Card>
        ) : null}
      </QueryBoundary>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
