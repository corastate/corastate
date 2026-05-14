/**
 * Top-level shell. Fetches /v1/devices from the backend and renders a
 * placeholder list. Not the real product UI; this is here to prove the wire
 * is hot from the React app through Fastify to Postgres.
 */

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DeviceList, type Device } from '@/components/DeviceList';

interface DeviceListResponse {
  items: Device[];
  total: number;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; devices: Device[] }
  | { kind: 'error'; message: string };

export function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/v1/devices');
      if (!res.ok) {
        throw new Error(`backend returned ${res.status}`);
      }
      const body = (await res.json()) as DeviceListResponse;
      setState({ kind: 'ok', devices: body.items });
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
            {state.kind === 'loading' ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </header>

      <main className="container py-6">
        {state.kind === 'idle' && <div className="text-muted-foreground">Loading...</div>}
        {state.kind === 'loading' && <div className="text-muted-foreground">Loading devices...</div>}
        {state.kind === 'error' && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
            Could not reach the backend: {state.message}
          </div>
        )}
        {state.kind === 'ok' && <DeviceList devices={state.devices} />}
      </main>
    </div>
  );
}
