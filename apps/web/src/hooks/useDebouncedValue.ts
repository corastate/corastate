import { useEffect, useState } from 'react';

/**
 * Debounce a changing value. The fuzzy search inputs use this so each
 * keystroke doesn't fire a /v1/devices request.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
