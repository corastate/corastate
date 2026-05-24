/**
 * Devices report — paginated, filterable, sortable, exportable.
 *
 * Backed by /v1/devices, which accepts the full facet surface (sources,
 * missingFrom, compliance, platform, hasGaps, staleOnly, q, sort, dir).
 *
 * Filter state lives in the hash query string, so a filtered view is a
 * shareable URL. Pagination uses TanStack Query against the same cursor
 * encoding the backend issues. CSV export goes through the same API path
 * (limit lifted to 500) and the result is converted client-side.
 *
 * The sources query feeds the filter facet menus so the operator sees the
 * connector ids they actually have configured.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Lock,
  Search,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
} from 'lucide-react';

import type {
  Device,
  DeviceComplianceFilter,
  DeviceSortField,
  SortDirection,
} from '@corastate/contracts';

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
import { devicesQuery, getDevices, sourcesQuery, type DeviceListParams } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { getHashQuery, setHashQuery } from '@/lib/router';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 500;

interface FilterState {
  q: string;
  sources: string[];
  missingFrom: string[];
  compliance: DeviceComplianceFilter[];
  platform: string[];
  hasGaps: boolean;
  staleOnly: boolean;
  sort: DeviceSortField;
  dir: SortDirection;
}

const DEFAULT_FILTERS: FilterState = {
  q: '',
  sources: [],
  missingFrom: [],
  compliance: [],
  platform: [],
  hasGaps: false,
  staleOnly: false,
  sort: 'updatedAt',
  dir: 'desc',
};

const COMPLIANCE_OPTIONS: { value: DeviceComplianceFilter; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'at_risk', label: 'At risk' },
  { value: 'unknown', label: 'Unknown' },
];

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'macos', label: 'macOS' },
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'other', label: 'Other' },
];

const SORT_FIELDS: { value: DeviceSortField; label: string }[] = [
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'hostname', label: 'Hostname' },
  { value: 'ownerEmail', label: 'Owner' },
  { value: 'osVersion', label: 'OS' },
  { value: 'sourceCount', label: 'Source count' },
  { value: 'lastCheckIn', label: 'Last check-in' },
];

const SORTABLE_HEADERS: { field: DeviceSortField; label: string }[] = [
  { field: 'hostname', label: 'Hostname' },
  { field: 'ownerEmail', label: 'Owner' },
  { field: 'osVersion', label: 'OS' },
  { field: 'sourceCount', label: 'Sources' },
];

function readFiltersFromHash(): FilterState {
  const params = getHashQuery();
  const csv = (key: string): string[] => {
    const v = params.get(key);
    if (!v) return [];
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };
  return {
    q: params.get('q') ?? '',
    sources: csv('sources'),
    missingFrom: csv('missingFrom'),
    compliance: csv('compliance').filter(
      (c): c is DeviceComplianceFilter => c === 'healthy' || c === 'at_risk' || c === 'unknown',
    ),
    platform: csv('platform'),
    hasGaps: params.get('hasGaps') === 'true',
    staleOnly: params.get('staleOnly') === 'true',
    sort: (SORT_FIELDS.find((f) => f.value === params.get('sort'))?.value ??
      'updatedAt') as DeviceSortField,
    dir: params.get('dir') === 'asc' ? 'asc' : 'desc',
  };
}

function writeFiltersToHash(filters: FilterState): void {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.sources.length) params.set('sources', filters.sources.join(','));
  if (filters.missingFrom.length) params.set('missingFrom', filters.missingFrom.join(','));
  if (filters.compliance.length) params.set('compliance', filters.compliance.join(','));
  if (filters.platform.length) params.set('platform', filters.platform.join(','));
  if (filters.hasGaps) params.set('hasGaps', 'true');
  if (filters.staleOnly) params.set('staleOnly', 'true');
  if (filters.sort !== 'updatedAt') params.set('sort', filters.sort);
  if (filters.dir !== 'desc') params.set('dir', filters.dir);
  setHashQuery(params);
}

function buildParams(filters: FilterState, cursor: string | undefined): DeviceListParams {
  return {
    limit: PAGE_SIZE,
    cursor,
    q: filters.q.trim() || undefined,
    sources: filters.sources.length ? filters.sources : undefined,
    missingFrom: filters.missingFrom.length ? filters.missingFrom : undefined,
    compliance: filters.compliance.length ? filters.compliance : undefined,
    platform: filters.platform.length ? filters.platform : undefined,
    hasGaps: filters.hasGaps || undefined,
    staleOnly: filters.staleOnly || undefined,
    sort: filters.sort,
    dir: filters.dir,
  };
}

function filterCount(filters: FilterState): number {
  let n = 0;
  if (filters.q) n += 1;
  if (filters.sources.length) n += 1;
  if (filters.missingFrom.length) n += 1;
  if (filters.compliance.length) n += 1;
  if (filters.platform.length) n += 1;
  if (filters.hasGaps) n += 1;
  if (filters.staleOnly) n += 1;
  return n;
}

export function DevicesView(): JSX.Element {
  const [filters, setFilters] = useState<FilterState>(() => readFiltersFromHash());
  const debouncedQuery = useDebouncedValue(filters.q, 250);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const pageIndex = cursorStack.length - 1;
  const currentCursor = cursorStack[pageIndex];

  // Re-read the hash on hashchange so back/forward navigation works.
  useEffect(() => {
    const onChange = (): void => {
      setFilters(readFiltersFromHash());
      setCursorStack([undefined]);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  // Persist filter state to the hash. The pagination cursor is intentionally
  // not in the URL — a shared link should land on page 1 of the filtered view.
  useEffect(() => {
    writeFiltersToHash(filters);
  }, [filters]);

  const params = useMemo<DeviceListParams>(
    () => buildParams({ ...filters, q: debouncedQuery }, currentCursor),
    [filters, debouncedQuery, currentCursor],
  );

  const { data, isPending, isError, error, isFetching, refetch } = useQuery(devicesQuery(params));
  const { data: sourcesData } = useQuery(sourcesQuery());
  const sourceOptions = useMemo(() => {
    const items = sourcesData?.items ?? [];
    return items.map((s) => ({ value: s.type, label: `${s.name} · ${s.type}` }));
  }, [sourcesData]);

  const updateFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]): void => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setCursorStack([undefined]);
    },
    [],
  );

  const clearFilters = useCallback((): void => {
    setFilters({ ...DEFAULT_FILTERS });
    setCursorStack([undefined]);
  }, []);

  const onSort = useCallback((field: DeviceSortField): void => {
    setFilters((prev) => {
      if (prev.sort === field) {
        return { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { ...prev, sort: field, dir: 'asc' };
    });
    setCursorStack([undefined]);
  }, []);

  const handleNext = (): void => {
    if (data?.nextCursor) setCursorStack((s) => [...s, data.nextCursor!]);
  };
  const handleBack = (): void => {
    setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  };

  const onExport = useCallback(async (): Promise<void> => {
    const exportParams: DeviceListParams = {
      ...buildParams({ ...filters, q: debouncedQuery }, undefined),
      limit: EXPORT_LIMIT,
    };
    const result = await getDevices(exportParams);
    const csv = devicesToCsv(result.items);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corastate-devices-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, [filters, debouncedQuery]);

  const totalLabel =
    data?.total !== undefined ? `${data.total} match${data.total === 1 ? '' : 'es'}` : null;

  return (
    <div className="space-y-4">
      <PageHeader>
        <div>
          <PageHeaderTitle>Devices</PageHeaderTitle>
          <PageHeaderDescription>
            One row per correlated device. Filter by source coverage, compliance bucket, platform,
            or gap; export the filtered set as CSV.
          </PageHeaderDescription>
        </div>
        <PageHeaderActions>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onExport()}
            data-testid="devices-export"
            disabled={!data || data.items.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Export CSV
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <FilterBar
        filters={filters}
        sourceOptions={sourceOptions}
        onUpdate={updateFilter}
        onClear={clearFilters}
        totalLabel={totalLabel}
      />

      <QueryBoundary
        isPending={isPending}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
      >
        {data ? (
          <DevicesTable
            devices={data.items}
            pageIndex={pageIndex}
            hasNext={Boolean(data.nextCursor)}
            isFetching={isFetching}
            sort={filters.sort}
            dir={filters.dir}
            onSort={onSort}
            onNext={handleNext}
            onBack={handleBack}
          />
        ) : null}
      </QueryBoundary>
    </div>
  );
}

interface FilterBarProps {
  filters: FilterState;
  sourceOptions: { value: string; label: string }[];
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClear: () => void;
  totalLabel: string | null;
}

function FilterBar({
  filters,
  sourceOptions,
  onUpdate,
  onClear,
  totalLabel,
}: FilterBarProps): JSX.Element {
  const activeCount = filterCount(filters);
  return (
    <section
      className="space-y-3 rounded-md border border-border bg-card p-3"
      aria-label="Device filters"
      data-testid="devices-filterbar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search hostname or owner email"
            value={filters.q}
            onChange={(e) => onUpdate('q', e.target.value)}
            className="w-72 pl-8"
            aria-label="Search devices"
            data-testid="devices-search"
          />
        </div>
        <FacetMenu
          label="Sources"
          testId="filter-sources"
          options={sourceOptions}
          selected={filters.sources}
          onChange={(values) => onUpdate('sources', values)}
        />
        <FacetMenu
          label="Missing from"
          testId="filter-missing"
          options={sourceOptions}
          selected={filters.missingFrom}
          onChange={(values) => onUpdate('missingFrom', values)}
        />
        <FacetMenu
          label="Compliance"
          testId="filter-compliance"
          options={COMPLIANCE_OPTIONS}
          selected={filters.compliance}
          onChange={(values) =>
            onUpdate(
              'compliance',
              values.filter(
                (v): v is DeviceComplianceFilter =>
                  v === 'healthy' || v === 'at_risk' || v === 'unknown',
              ),
            )
          }
        />
        <FacetMenu
          label="Platform"
          testId="filter-platform"
          options={PLATFORM_OPTIONS}
          selected={filters.platform}
          onChange={(values) => onUpdate('platform', values)}
        />
        <ToggleChip
          label="Has gaps"
          testId="filter-hasgaps"
          active={filters.hasGaps}
          onClick={() => onUpdate('hasGaps', !filters.hasGaps)}
        />
        <ToggleChip
          label="Stale only"
          testId="filter-stale"
          active={filters.staleOnly}
          onClick={() => onUpdate('staleOnly', !filters.staleOnly)}
        />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {totalLabel ? <span data-testid="devices-total">{totalLabel}</span> : null}
          {activeCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              data-testid="filter-clear"
              className="h-7 px-2 text-xs"
            >
              Clear ({activeCount})
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface FacetMenuProps {
  label: string;
  testId: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function FacetMenu({ label, testId, options, selected, onChange }: FacetMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);

  // Close on outside click. Using a global listener rather than Radix because
  // the menu is plain HTML; Radix would be overkill for one popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-facet="${testId}"]`)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, testId]);

  const toggle = (value: string): void => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  return (
    <div className="relative" data-facet={testId}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-9 gap-1',
          selected.length > 0 && 'border-primary/40 bg-[color:var(--accent-tint)] text-primary',
        )}
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{label}</span>
        {selected.length > 0 ? (
          <Badge tone="info" className="px-1 py-0">
            {selected.length}
          </Badge>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[14rem] rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No options</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <li key={opt.value}>
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      data-testid={`${testId}-option-${opt.value}`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[color:var(--accent)]"
                        checked={checked}
                        onChange={() => toggle(opt.value)}
                      />
                      <span className="flex-1 truncate">{opt.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selected.length > 0 ? (
            <div className="border-t border-border pt-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" aria-hidden /> Clear {label.toLowerCase()}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ToggleChipProps {
  label: string;
  testId: string;
  active: boolean;
  onClick: () => void;
}

function ToggleChip({ label, testId, active, onClick }: ToggleChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
        active
          ? 'border-primary/40 bg-[color:var(--accent-tint)] text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

interface DevicesTableProps {
  devices: Device[];
  pageIndex: number;
  hasNext: boolean;
  isFetching: boolean;
  sort: DeviceSortField;
  dir: SortDirection;
  onSort: (field: DeviceSortField) => void;
  onNext: () => void;
  onBack: () => void;
}

function DevicesTable({
  devices,
  pageIndex,
  hasNext,
  isFetching,
  sort,
  dir,
  onSort,
  onNext,
  onBack,
}: DevicesTableProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <div
        className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground"
        data-testid="devices-empty"
      >
        No devices match. Adjust filters or run a sync (<code>pnpm seed</code>) and refresh.
      </div>
    );
  }
  return (
    <>
      <div className="rounded-md border border-border bg-card">
        <Table data-testid="devices-table">
          <TableHeader>
            <TableRow>
              {SORTABLE_HEADERS.map((h) => (
                <SortableHeader
                  key={h.field}
                  field={h.field}
                  label={h.label}
                  activeField={sort}
                  dir={dir}
                  onSort={onSort}
                />
              ))}
              <TableHead>Health</TableHead>
              <TableHead>Missing from</TableHead>
              <SortableHeader
                field="lastCheckIn"
                label="Last seen"
                activeField={sort}
                dir={dir}
                onSort={onSort}
              />
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

interface SortableHeaderProps {
  field: DeviceSortField;
  label: string;
  activeField: DeviceSortField;
  dir: SortDirection;
  onSort: (field: DeviceSortField) => void;
}

function SortableHeader({
  field,
  label,
  activeField,
  dir,
  onSort,
}: SortableHeaderProps): JSX.Element {
  const active = activeField === field;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
        data-testid={`sort-${field}`}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span>{label}</span>
        {active ? (
          dir === 'asc' ? (
            <ChevronUp className="h-3 w-3" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-30" aria-hidden />
        )}
      </button>
    </TableHead>
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
        <CheckCircle2 className="h-3.5 w-3.5 text-status-low" aria-hidden /> complete
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
  return (
    <div className="flex items-center gap-2">
      <FlagIcon Icon={Lock} label="Disk encryption" state={device.diskEncryption} />
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
    state === true
      ? 'text-status-low'
      : state === false
        ? 'text-status-critical'
        : 'text-muted-foreground/60';
  const status = state === null ? 'unknown' : state ? 'yes' : 'no';
  return (
    <span
      className={`inline-flex items-center ${tone}`}
      title={`${label}: ${status}`}
      aria-label={`${label}: ${status}`}
    >
      {state === false ? (
        <XCircle className="h-4 w-4" aria-hidden />
      ) : (
        <Icon className="h-4 w-4" aria-hidden />
      )}
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

const CSV_HEADERS = [
  'hostname',
  'owner_email',
  'os_version',
  'serial_number',
  'sources',
  'missing_from',
  'disk_encryption',
  'mdm_enrolled',
  'agent_running',
  'last_check_in',
];

function devicesToCsv(devices: Device[]): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const s = Array.isArray(value)
      ? value.join('|')
      : value instanceof Date
        ? value.toISOString()
        : String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const rows = [CSV_HEADERS.join(',')];
  for (const d of devices) {
    rows.push(
      [
        d.hostname,
        d.ownerEmail,
        d.osVersion,
        d.serialNumber,
        d.sources,
        d.missingFrom,
        d.diskEncryption,
        d.mdmEnrolled,
        d.agentRunning,
        d.lastCheckIn,
      ]
        .map(escape)
        .join(','),
    );
  }
  return rows.join('\n') + '\n';
}
