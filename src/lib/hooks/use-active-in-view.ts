'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps the selected chip of a horizontally scrolling row visible: on phones a row of segments or tabs
 * is wider than the screen, and the selected one can otherwise sit scrolled out of sight.
 * Put the returned ref on the scrolling element; the selected child carries aria-selected or aria-pressed.
 */
export function useActiveInView<T extends HTMLElement>(activeKey: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }, [activeKey]);
  return ref;
}
