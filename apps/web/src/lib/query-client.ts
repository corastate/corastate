/**
 * Single QueryClient for the SPA. Default options applied here so individual
 * `useQuery` call sites stay terse and consistent.
 */

import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Fail-fast in dev — the proxy points at one local backend, retry-loops
        // only obscure setup errors. The Devices/Identities views handle their
        // own per-query retry via TanStack Query defaults where it pays.
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
    },
  });
}
