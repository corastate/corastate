import { Component, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background">
        <main className="container py-12">
          <Card className="border-status-critical/50">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                The UI hit an unrecoverable error. Reloading usually clears it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <pre className="overflow-x-auto rounded-md bg-status-critical-bg p-3 font-mono text-xs text-status-critical-text">
                {this.state.error.message}
              </pre>
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
}
