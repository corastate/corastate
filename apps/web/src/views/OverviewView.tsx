/**
 * Overview dashboard. Backed by GET /v1/overview, which aggregates KPIs +
 * per-source coverage + sync freshness in one round trip. The wedge of the
 * product — cross-tool gaps — gets first-class real estate.
 *
 * Charts are hand-rolled SVG / CSS rather than a charting library: the four
 * widgets here (KPI cards, source-coverage bars, donut over three buckets,
 * sync-freshness rows) are simple enough that adding a chart dependency
 * would cost more than it saves.
 */

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  HelpCircle,
  ShieldAlert,
  Users,
} from 'lucide-react';

import type {
  HealthDistribution,
  OverviewResponse,
  SourceCoverageItem,
  SyncFreshnessItem,
} from '@corastate/contracts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderDescription, PageHeaderTitle } from '@/components/PageHeader';
import { QueryBoundary } from '@/components/QueryBoundary';
import { overviewQuery } from '@/lib/api';
import { formatAbsolute, formatRelative } from '@/lib/format';

export function OverviewView(): JSX.Element {
  const { data, isPending, isError, error, refetch } = useQuery(overviewQuery());

  return (
    <div className="space-y-6">
      <PageHeader>
        <div>
          <PageHeaderTitle>Overview</PageHeaderTitle>
          <PageHeaderDescription>
            One-page summary across every connected source. Gaps are the wedge: a device an MDM
            should see but doesn't is the signal worth chasing.
          </PageHeaderDescription>
        </div>
      </PageHeader>

      <QueryBoundary
        isPending={isPending}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
      >
        {data ? <Dashboard data={data} /> : null}
      </QueryBoundary>
    </div>
  );
}

function Dashboard({ data }: { data: OverviewResponse }): JSX.Element {
  return (
    <div className="space-y-6" data-testid="overview-dashboard">
      <KpiGrid data={data} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SourceCoverageCard items={data.sourceCoverage} />
        </div>
        <HealthDistributionCard distribution={data.healthDistribution} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GapSummaryCard items={data.sourceCoverage} />
        <SyncFreshnessCard
          items={data.syncFreshness}
          thresholdHours={data.thresholds.sourceStaleHours}
        />
      </div>
    </div>
  );
}

function KpiGrid({ data }: { data: OverviewResponse }): JSX.Element {
  const { kpis } = data;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="overview-kpis">
      <KpiCard
        label="Devices"
        value={kpis.deviceCount}
        Icon={Boxes}
        hint={`${kpis.identityCount} identities`}
        IconHint={Users}
      />
      <KpiCard
        label="Healthy"
        value={kpis.healthyCount}
        tone="good"
        Icon={CheckCircle2}
        hint={`${pct(kpis.healthyCount, kpis.deviceCount)} of fleet`}
      />
      <KpiCard
        label="At risk"
        value={kpis.atRiskCount}
        tone="warn"
        Icon={ShieldAlert}
        hint={`${kpis.unknownCount} unknown`}
        IconHint={HelpCircle}
      />
      <KpiCard
        label="Orphaned"
        value={kpis.orphanedCount}
        tone="bad"
        Icon={AlertTriangle}
        hint={`${kpis.staleCount} stale > ${kpis.staleThresholdDays}d`}
        IconHint={Clock}
        focused
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  hint?: string;
  Icon: typeof CheckCircle2;
  IconHint?: typeof CheckCircle2;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  /** Marks this card as the focused metric — sienna left-border, square corners. */
  focused?: boolean;
}

function KpiCard({
  label,
  value,
  hint,
  Icon,
  IconHint,
  tone = 'neutral',
  focused,
}: KpiCardProps): JSX.Element {
  // Icon tone draws from the PDS status scale solids; the headline value
  // itself stays in body ink so cards read calm. Only the focused metric
  // wears the sienna left-border highlight (square corners per PDS).
  const iconTone = {
    good: 'text-status-low',
    warn: 'text-status-high',
    bad: 'text-status-critical',
    neutral: 'text-muted-foreground',
  }[tone];
  return (
    <Card
      data-testid={`overview-kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={
        focused ? 'rounded-none border-l-[3px] !border-l-[color:var(--focus-border)]' : undefined
      }
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${iconTone}`} aria-hidden />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {value.toLocaleString()}
        </div>
        {hint ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {IconHint ? <IconHint className="h-3 w-3" aria-hidden /> : null}
            <span>{hint}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SourceCoverageCard({ items }: { items: SourceCoverageItem[] }): JSX.Element {
  const maxCount = Math.max(1, ...items.map((s) => s.deviceCount));
  return (
    <Card data-testid="overview-source-coverage">
      <CardHeader>
        <CardTitle className="text-base">Source coverage</CardTitle>
        <CardDescription>
          Distinct devices each connector has observed, relative to the source with the widest view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyHint>No sources configured.</EmptyHint>
        ) : (
          <ul className="space-y-3">
            {items.map((source) => (
              <li key={source.id} className="space-y-1.5" data-testid="overview-source-row">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{source.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {source.connectorId}
                    </span>
                    {!source.active ? <Badge tone="neutral">paused</Badge> : null}
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3 text-xs tabular-nums">
                    <span className="font-semibold text-foreground">{source.deviceCount}</span>
                    <span className="text-muted-foreground">devices</span>
                  </div>
                </div>
                <CoverageBar
                  value={source.deviceCount}
                  max={maxCount}
                  tone={source.stale ? 'warn' : 'info'}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CoverageBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: 'info' | 'warn';
}): JSX.Element {
  // Charts wear neutral by default; PDS reserves the accent for nav,
  // links, buttons, focused metric, logo. Stale coverage gets the high
  // status amber so the eye still catches it.
  const widthPct = Math.max(2, Math.round((value / max) * 100));
  const fill = tone === 'warn' ? 'bg-status-high' : 'bg-foreground/60';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${widthPct}%` }} />
    </div>
  );
}

function GapSummaryCard({ items }: { items: SourceCoverageItem[] }): JSX.Element {
  const ranked = [...items]
    .filter((s) => s.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount);
  return (
    <Card data-testid="overview-gap-summary">
      <CardHeader>
        <CardTitle className="text-base">Cross-tool gaps</CardTitle>
        <CardDescription>
          Devices that should be in each source but aren't. The product's signal in one place.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <EmptyHint>
            <CheckCircle2 className="mr-1 inline h-4 w-4 text-status-low" aria-hidden />
            No gaps detected.
          </EmptyHint>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="overview-gap-list">
            {ranked.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{source.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {source.connectorId}
                  </span>
                </div>
                <a
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  href={`#/devices?missingFrom=${encodeURIComponent(source.connectorId)}&hasGaps=true`}
                >
                  <Badge tone="warn">{source.missingCount} missing</Badge>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HealthDistributionCard({
  distribution,
}: {
  distribution: HealthDistribution;
}): JSX.Element {
  const total = distribution.healthy + distribution.atRisk + distribution.unknown;
  return (
    <Card data-testid="overview-health-distribution">
      <CardHeader>
        <CardTitle className="text-base">Health distribution</CardTitle>
        <CardDescription>Compliance bucket per correlated device.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Donut
          segments={[
            { value: distribution.healthy, color: 'var(--status-low)', label: 'healthy' },
            { value: distribution.atRisk, color: 'var(--status-high)', label: 'at risk' },
            { value: distribution.unknown, color: 'var(--status-info)', label: 'unknown' },
          ]}
          total={total}
        />
        <ul className="w-full space-y-1 text-xs">
          <LegendRow
            color="var(--status-low)"
            label="Healthy"
            value={distribution.healthy}
            total={total}
          />
          <LegendRow
            color="var(--status-high)"
            label="At risk"
            value={distribution.atRisk}
            total={total}
          />
          <LegendRow
            color="var(--status-info)"
            label="Unknown"
            value={distribution.unknown}
            total={total}
          />
        </ul>
      </CardContent>
    </Card>
  );
}

interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

function Donut({ segments, total }: { segments: DonutSegment[]; total: number }): JSX.Element {
  const size = 140;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-32 w-32"
      role="img"
      aria-label={`Health distribution donut, ${total} devices total`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-[color:var(--n-2)]"
      />
      {total > 0
        ? segments.map((seg) => {
            if (seg.value === 0) return null;
            const length = (seg.value / total) * circumference;
            const dashArray = `${length} ${circumference - length}`;
            const dashOffset = circumference - offset;
            offset += length;
            return (
              <circle
                key={seg.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })
        : null}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground text-2xl font-semibold tabular-nums"
      >
        {total}
      </text>
    </svg>
  );
}

function LegendRow({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <span className="text-muted-foreground">{label}</span>
      </span>
      <span className="font-medium tabular-nums">
        {value} <span className="text-muted-foreground">· {pct(value, total)}</span>
      </span>
    </li>
  );
}

function SyncFreshnessCard({
  items,
  thresholdHours,
}: {
  items: SyncFreshnessItem[];
  thresholdHours: number;
}): JSX.Element {
  return (
    <Card data-testid="overview-sync-freshness">
      <CardHeader>
        <CardTitle className="text-base">Sync freshness</CardTitle>
        <CardDescription>
          When each source last reported in. Stale &gt; {thresholdHours}h.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyHint>No sources configured.</EmptyHint>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li
                key={item.sourceId}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-3 py-2"
                data-testid="overview-sync-row"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{item.sourceName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.connectorId}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span
                    className="text-muted-foreground"
                    title={item.lastSyncedAt ? formatAbsolute(item.lastSyncedAt) : undefined}
                  >
                    {formatRelative(item.lastSyncedAt)}
                  </span>
                  {item.stale ? <Badge tone="warn">stale</Badge> : <Badge tone="good">fresh</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}
