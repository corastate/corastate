/**
 * Hash-based router. Three routes today (devices/identities/sources) plus
 * the diagnostic system-health card. A real router (react-router, TanStack
 * Router) is overkill for four screens with no nested layouts.
 *
 * The hash strategy is deliberate: it avoids backend wiring for SPA history
 * fallback during the Phase 1 walkthrough, where the web app is served by
 * Vite (or `pnpm preview`) without an explicit fallback rule.
 */

import { useSyncExternalStore } from 'react';

export const routes = ['devices', 'identities', 'sources', 'health'] as const;
export type Route = (typeof routes)[number];

const DEFAULT_ROUTE: Route = 'devices';

function parseHash(hash: string): Route {
  const value = hash.replace(/^#\/?/, '');
  return (routes as readonly string[]).includes(value) ? (value as Route) : DEFAULT_ROUTE;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): Route {
  return parseHash(window.location.hash);
}

function getServerSnapshot(): Route {
  return DEFAULT_ROUTE;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function navigate(route: Route): void {
  if (parseHash(window.location.hash) === route) return;
  window.location.hash = `#/${route}`;
}
