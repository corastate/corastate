/**
 * Top-level app. Hash-routed across four views — three product (devices,
 * identities, sources) and one diagnostic (health).
 *
 * Per apps/web/FRONTEND.md, product views use TanStack Query. The shell
 * here doesn't fetch anything itself; routing is a derived value from the
 * hash, computed inside each view's `useQuery`.
 */

import { AppShell } from '@/components/AppShell';
import { useRoute } from '@/lib/router';
import { DevicesView } from '@/views/DevicesView';
import { HealthView } from '@/views/HealthView';
import { IdentitiesView } from '@/views/IdentitiesView';
import { SourcesView } from '@/views/SourcesView';

export function App(): JSX.Element {
  const route = useRoute();
  return (
    <AppShell>
      {route === 'devices' && <DevicesView />}
      {route === 'identities' && <IdentitiesView />}
      {route === 'sources' && <SourcesView />}
      {route === 'health' && <HealthView />}
    </AppShell>
  );
}
