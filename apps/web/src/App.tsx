/**
 * Top-level shell. This structural commit only proves the wire from React →
 * Fastify → Postgres by polling /internal/healthz; real device + identity
 * views land in Week 4 (phase-1-sprint-plan-v3.md §"Week 4"). The frontend
 * is allowed to consume both /v1 and /internal; for diagnostic views,
 * /internal is the right namespace.
 */

import { useCallback, useEffect, useState } from 'react';

import type { HealthResponse } from '@corastate/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

export function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/internal/healthz');
      if (!res.ok) {
        throw new Error(`backend returned ${res.status}`);
      }
      const body = (await res.json()) as HealthResponse;
      setState({ kind: 'ok', health: body });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex items-center justify-between py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Corastate</h1>
            <p className="text-sm text-muted-foreground">Device health, joined across tools.</p>
          </div>
          <Button onClick={() => void load()} disabled={state.kind === 'loading'}>
            {state.kind === 'loading' ? 'Checking...' : 'Refresh'}
          </Button>
        </div>
      </header>

      <main className="container py-6">
        {state.kind === 'idle' && <div className="text-muted-foreground">Loading...</div>}
        {state.kind === 'loading' && (
          <div className="text-muted-foreground">Checking system health...</div>
        )}
        {state.kind === 'error' && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
            Could not reach the backend: {state.message}
          </div>
        )}
        {state.kind === 'ok' && (
          <Card>
            <CardHeader>
              <CardTitle>System health</CardTitle>
              <CardDescription>
                The structural scaffold is up. Device and identity views land in Phase 1 Week 4.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div>
                Status: <span className="font-mono">{state.health.status}</span>
              </div>
              <div>
                Database: <span className="font-mono">{state.health.db}</span>
              </div>
              <div>
                Uptime: <span className="font-mono">{state.health.uptime}s</span>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
