'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useState that remembers a per-browser UI preference (column visibility, density, page size).
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded and
 * the component always renders with `initial` first — no hydration mismatch.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `fluxen:${key}`;
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, [storageKey]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          /* storage unavailable — the preference just won't persist */
        }
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, update] as const;
}
