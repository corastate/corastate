/**
 * Devices view — paginated table backed by /v1/devices.
 *
 * Columns: hostname, owner email, OS, sources (pills), health flags
 * (disk-encryption + MDM + agent), missing-from gaps, last check-in.
 *
 * Pagination is cursor-based. We keep a stack of cursors so the Back button
 * can step backwards without the server needing a reverse cursor — the
 * cursor[0] = first page, cursor[i] = page i+1.
 *
 * Search is a debounced fuzzy filter over hostname / owner email; resetting
 * the search resets pagination.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Search, ShieldCheck, Smartphone, XCircle } from 'lucide-react';

import type { Device } from '@corastate/contracts';

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { devicesQuery } from '@/lib/api';
import { formatRelative } from '@/lib/format';

const PAGE_SIZE = 25;

export function DevicesView(): JSX.Element {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  // cursorStack[i] is the cursor used to fetch the i-th page. Page 0 has
  // cursor=undefined. Pushing a cursor advances; popping rewinds.
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

  const { data, isPending, isError, error, isFetching, refetch } = useQuery(devicesQuery(params));

  // Search edits reset pagination back to the first page so the cursor for
  // the old query doesn't leak into the new query's keyset window.
  const onQueryChange = (value: string): void => {
    setQuery(value);
    if (cursorStack.length > 1) setCursorStack([undefined]);
  };

  const handleNext = (): void => {
    if (data?.nextCursor) {
      setCursorStack((s) => [...s, data.nextCursor!]);
    }
  };
  const handleBack = (): void => {
    setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <PageHeaderTitle>Devices</PageHeaderTitle>
          <PageHeaderDescription>
            One row per correlated device. Source pills show which tools see it; gaps show which
            tools should but don't.
          </PageHeaderDescription>
        </div>
        <PageHeaderActions>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search hostname or owner email"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="w-72 pl-8"
              aria-label="Search devices"
              data-testid="devices-search"
            />
          </div>
        </PageHeaderActions>
      </PageHeader>

      <QueryBoundary isPending={isPending} isError={isError} error={error} onRetry={() => void refetch()}>
        {data ? (
          <DevicesTable
            devices={data.items}
            pageIndex={pageIndex}
            hasNext={Boolean(data.nextCursor)}
            isFetching={isFetching}
            onNext={handleNext}
            onBack={handleBack}
          />
        ) : null}
      </QueryBoundary>
    </div>
  );
}

interface DevicesTableProps {
  devices: Device[];
  pageIndex: number;
  hasNext: boolean;
  isFetching: boolean;
  onNext: () => void;
  onBack: () => void;
}

function DevicesTable({
  devices,
  pageIndex,
  hasNext,
  isFetching,
  onNext,
  onBack,
}: DevicesTableProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="devices-empty">
        No devices match. Run a sync (or <code>pnpm seed</code>) and refresh.
      </div>
    );
  }
  return (
    <>
      <div className="rounded-md border bg-card">
        <Table data-testid="devices-table">
          <TableHeader>
            <TableRow>
              <TableHead>Hostname</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>OS</TableHead>
              <TableHead>Sources</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Missing from</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((device) => (
              <DeviceRow key={device.id} device={device} />
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationFooter
        pageIndex={pageIndex}
        hasNext={hasNext}
        isFetching={isFetching}
        onNext={onNext}
        onBack={onBack}
      />
    </>
  );
}

function DeviceRow({ device }: { device: Device }): JSX.Element {
  return (
    <TableRow data-testid="device-row">
      <TableCell className="font-medium">{device.hostname ?? <Muted>unknown</Muted>}</TableCell>
      <TableCell>{device.ownerEmail ?? <Muted>—</Muted>}</TableCell>
      <TableCell className="font-mono text-xs">{device.osVersion ?? <Muted>—</Muted>}</TableCell>
      <TableCell>
        <SourcePills sources={device.sources} />
      </TableCell>
      <TableCell>
        <HealthFlags device={device} />
      </TableCell>
      <TableCell>
        <MissingFrom missing={device.missingFrom} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatRelative(device.lastCheckIn)}
      </TableCell>
    </TableRow>
  );
}

function SourcePills({ sources }: { sources: string[] }): JSX.Element {
  if (sources.length === 0) return <Muted>none</Muted>;
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <Badge key={s} tone="info">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function MissingFrom({ missing }: { missing: string[] }): JSX.Element {
  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> complete
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {missing.map((s) => (
        <Badge key={s} tone="warn">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function HealthFlags({ device }: { device: Device }): JSX.Element {
  // Three flags shown as compact icons; null reads as "unknown" — we don't
  // claim a device is healthy when we have no signal.
  return (
    <div className="flex items-center gap-2">
      <FlagIcon
        Icon={Lock}
        label="Disk encryption"
        state={device.diskEncryption}
      />
      <FlagIcon Icon={Smartphone} label="MDM enrolled" state={device.mdmEnrolled} />
      <FlagIcon Icon={ShieldCheck} label="EDR agent reporting" state={device.agentRunning} />
    </div>
  );
}

interface FlagIconProps {
  Icon: typeof Lock;
  label: string;
  state: boolean | null;
}

function FlagIcon({ Icon, label, state }: FlagIconProps): JSX.Element {
  const tone =
    state === true ? 'text-emerald-600' : state === false ? 'text-destructive' : 'text-muted-foreground/60';
  const status = state === null ? 'unknown' : state ? 'yes' : 'no';
  return (
    <span className={`inline-flex items-center ${tone}`} title={`${label}: ${status}`} aria-label={`${label}: ${status}`}>
      {state === false ? <XCircle className="h-4 w-4" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
    </span>
  );
}

function PaginationFooter({
  pageIndex,
  hasNext,
  isFetching,
  onNext,
  onBack,
}: {
  pageIndex: number;
  hasNext: boolean;
  isFetching: boolean;
  onNext: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
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
  );
}

function Muted({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="text-muted-foreground">{children}</span>;
}
