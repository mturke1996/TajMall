'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `value` once it has stopped changing for `delayMs`. `flush` jumps to the latest value at once, for the
 * moment a result is needed now (a save pressed before the pause ended).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): [T, () => void] {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  const flush = useCallback(() => setSettled(latest.current), []);
  return [settled, flush];
}
