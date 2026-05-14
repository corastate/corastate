/**
 * Placeholder list of devices. Renders whatever /v1/devices returned.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface Device {
  id: string;
  displayName: string | null;
  updatedAt: string;
  sources: string[];
}

interface DeviceListProps {
  devices: Device[];
}

export function DeviceList({ devices }: DeviceListProps): JSX.Element {
  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No devices yet</CardTitle>
          <CardDescription>
            Run a connector sync to see devices show up here. Today the catalog is empty.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {devices.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle className="text-lg">{d.displayName ?? 'Unnamed device'}</CardTitle>
            <CardDescription className="font-mono text-xs">{d.id}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div>Updated {new Date(d.updatedAt).toLocaleString()}</div>
            <div>
              {d.sources.length > 0 ? `Seen in: ${d.sources.join(', ')}` : 'No source data yet'}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
