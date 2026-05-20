/**
 * Sources view — list of configured connector sources with their last-sync
 * time and status.
 *
 * No pagination; one row per configured source is fine at the 5-connector
 * scale Phase 1 ships. If multi-tenant or many-source installs land later,
 * this becomes a paginated table like the other two views.
 */

import { useQuery } from '@tanstack/react-query';
import { Pause, Play, RefreshCw } from 'lucide-react';

import type { SourceListItem, SourceStatus } from '@corastate/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/PageHeader';
import { QueryBoundary } from '@/components/QueryBoundary';
import { sourcesQuery } from '@/lib/api';
import { formatAbsolute, formatRelative } from '@/lib/format';

export function SourcesView(): JSX.Element {
  const { data, isPending, isError, error, isFetching, refetch } = useQuery(sourcesQuery());

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <PageHeaderTitle>Sources</PageHeaderTitle>
          <PageHeaderDescription>
            Configured connectors and the status of their most recent sync. The worker polls active
            sources on its cadence.
          </PageHeaderDescription>
        </div>
        <PageHeaderActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            data-testid="sources-refresh"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <QueryBoundary isPending={isPending} isError={isError} error={error} onRetry={() => void refetch()}>
        {data ? <SourcesGrid sources={data.items} /> : null}
      </QueryBoundary>
    </div>
  );
}

function SourcesGrid({ sources }: { sources: SourceListItem[] }): JSX.Element {
  if (sources.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="sources-empty">
        No sources configured. The seed script (<code>pnpm seed</code>) creates a demo Okta + Defender
        pair; in production, add sources via the CLI.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" data-testid="sources-grid">
      {sources.map((source) => (
        <SourceCard key={source.id} source={source} />
      ))}
    </div>
  );
}

function SourceCard({ source }: { source: SourceListItem }): JSX.Element {
  return (
    <Card data-testid="source-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{source.name}</CardTitle>
            <CardDescription className="font-mono text-xs">{source.type}</CardDescription>
          </div>
          <ActiveBadge active={source.active} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <StatusBadge status={source.status} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Last sync</span>
          <span
            className="font-medium"
            title={source.lastSyncedAt ? formatAbsolute(source.lastSyncedAt) : undefined}
          >
            {formatRelative(source.lastSyncedAt)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveBadge({ active }: { active: boolean }): JSX.Element {
  return active ? (
    <Badge tone="good">
      <Play className="mr-1 h-3 w-3" aria-hidden /> active
    </Badge>
  ) : (
    <Badge tone="neutral">
      <Pause className="mr-1 h-3 w-3" aria-hidden /> paused
    </Badge>
  );
}

function StatusBadge({ status }: { status: SourceStatus }): JSX.Element {
  switch (status) {
    case 'succeeded':
      return <Badge tone="good">{status}</Badge>;
    case 'running':
      return <Badge tone="info">{status}</Badge>;
    case 'failed':
      return <Badge tone="bad">{status}</Badge>;
    case 'cancelled':
      return <Badge tone="warn">{status}</Badge>;
    case 'idle':
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}
