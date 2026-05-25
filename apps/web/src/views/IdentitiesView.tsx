/**
 * Identities view — paginated table backed by /v1/identities.
 *
 * Columns: display name, email, status, device count, last login.
 *
 * Same pagination + debounced search shape as DevicesView. The two could
 * grow into a shared compound table primitive once a third view exists,
 * but two is not enough signal to commit to the abstraction yet.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

import type { IdentityListItem, IdentityStatus } from '@corastate/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@/components/PageHeader';
import { QueryBoundary } from '@/components/QueryBoundary';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { identitiesQuery } from '@/lib/api';
import { formatRelative } from '@/lib/format';

const PAGE_SIZE = 25;

export function IdentitiesView(): JSX.Element {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const pageIndex = cursorStack.length - 1;
  const currentCursor = cursorStack[pageIndex];

  const params = useMemo(
    () => ({
      limit: PAGE_SIZE,
      cursor: currentCursor,
      q: debouncedQuery.trim() || undefined,
    }),
    [currentCursor, debouncedQuery],
  );

  const { data, isPending, isError, error, isFetching, refetch } = useQuery(
    identitiesQuery(params),
  );

  const onQueryChange = (value: string): void => {
    setQuery(value);
    if (cursorStack.length > 1) setCursorStack([undefined]);
  };

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <PageHeaderTitle>Identities</PageHeaderTitle>
          <PageHeaderDescription>
            People as the directory sees them. Device count is how many correlated devices share the
            identity's email.
          </PageHeaderDescription>
        </div>
        <PageHeaderActions className="w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search name or email"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="w-full pl-8 sm:w-72"
              aria-label="Search identities"
              data-testid="identities-search"
            />
          </div>
        </PageHeaderActions>
      </PageHeader>

      <QueryBoundary
        isPending={isPending}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
      >
        {data ? (
          <IdentitiesTable
            identities={data.items}
            pageIndex={pageIndex}
            hasNext={Boolean(data.nextCursor)}
            isFetching={isFetching}
            onNext={() => {
              if (data.nextCursor) setCursorStack((s) => [...s, data.nextCursor!]);
            }}
            onBack={() => setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s))}
          />
        ) : null}
      </QueryBoundary>
    </div>
  );
}

interface IdentitiesTableProps {
  identities: IdentityListItem[];
  pageIndex: number;
  hasNext: boolean;
  isFetching: boolean;
  onNext: () => void;
  onBack: () => void;
}

function IdentitiesTable({
  identities,
  pageIndex,
  hasNext,
  isFetching,
  onNext,
  onBack,
}: IdentitiesTableProps): JSX.Element {
  if (identities.length === 0) {
    return (
      <div
        className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground"
        data-testid="identities-empty"
      >
        No identities match. Run a sync (or <code>pnpm seed</code>) and refresh.
      </div>
    );
  }
  return (
    <>
      <div className="rounded-md border border-border bg-card">
        <Table data-testid="identities-table">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Devices</TableHead>
              <TableHead>Last login</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {identities.map((identity) => (
              <IdentityRow key={identity.id} identity={identity} />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between pt-1 text-sm">
        <div className="text-muted-foreground">
          Page {pageIndex + 1}
          {isFetching ? ' · refreshing…' : ''}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={pageIndex === 0 || isFetching}
            data-testid="page-back"
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={!hasNext || isFetching}
            data-testid="page-next"
          >
            Next <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </>
  );
}

function IdentityRow({ identity }: { identity: IdentityListItem }): JSX.Element {
  return (
    <TableRow data-testid="identity-row">
      <TableCell className="font-medium">
        {identity.displayName ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="font-mono text-xs">{identity.email}</TableCell>
      <TableCell>
        <StatusBadge status={identity.status} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{identity.deviceCount}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatRelative(identity.lastLogin)}
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: IdentityStatus }): JSX.Element {
  const tone =
    status === 'active'
      ? 'good'
      : status === 'suspended'
        ? 'warn'
        : status === 'deactivated'
          ? 'bad'
          : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
