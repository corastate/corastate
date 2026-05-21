/**
 * Top-level shell. Renders the header with nav, then routes to one of the
 * four views via the hash router in lib/router.ts. Header is sticky so the
 * navigation chrome stays visible while a long table scrolls.
 */

import { Activity, Boxes, LayoutDashboard, Plug, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { navigate, useRoute, type Route } from '@/lib/router';

interface NavItem {
  route: Route;
  label: string;
  Icon: typeof Activity;
}

const NAV_ITEMS: NavItem[] = [
  { route: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { route: 'devices', label: 'Devices', Icon: Boxes },
  { route: 'identities', label: 'Identities', Icon: Users },
  { route: 'sources', label: 'Sources', Icon: Plug },
  { route: 'health', label: 'Health', Icon: Activity },
];

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps): JSX.Element {
  const active = useRoute();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="container flex items-center gap-6 py-3">
          <div className="flex flex-col">
            <h1 className="text-base font-semibold leading-tight tracking-tight">Corastate</h1>
            <p className="text-xs text-muted-foreground">Device health, joined across tools.</p>
          </div>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.route} item={item} active={active === item.route} />
            ))}
          </nav>
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
}

function NavLink({ item, active }: NavLinkProps): JSX.Element {
  return (
    <a
      href={`#/${item.route}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(item.route);
      }}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.route}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <item.Icon className="h-4 w-4" aria-hidden />
      {item.label}
    </a>
  );
}
