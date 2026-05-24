/**
 * Top-level shell. Renders the header with the wordmark, primary nav, and
 * theme toggle, then routes to one of the five views via the hash router
 * in lib/router.ts. Header is sticky so the navigation chrome stays
 * visible while a long table scrolls.
 *
 * PDS rule: the active nav item is one of the few places that wears the
 * sienna accent. Inactive items stay warm-grey neutral.
 */

import { Activity, Boxes, LayoutDashboard, Plug, Users } from 'lucide-react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/Wordmark';
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
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex items-center gap-6 py-3">
          <a
            href="#/overview"
            onClick={(e) => {
              e.preventDefault();
              navigate('overview');
            }}
            className="inline-flex items-center"
            aria-label="Corastate home"
          >
            <Wordmark className="block h-5" />
          </a>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.route} item={item} active={active === item.route} />
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
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
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <item.Icon className="h-4 w-4" aria-hidden />
      {item.label}
    </a>
  );
}
