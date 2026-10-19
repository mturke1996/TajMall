'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  builtInPresets,
  deletePreset,
  parsePresetStore,
  savePresets,
  serializePresetStore,
  upsertPreset,
  type ReportPreset,
  type TransactionReportOptions,
} from '@/lib/report-options';

/**
 * Saved presets live in this browser's localStorage (read through useSyncExternalStore, so a change made in
 * another tab shows up and the server render and the first client render agree). When the browser refuses to
 * store (a private window, blocked or full storage) they are kept in memory instead, so the bar still works for
 * this visit, and `persisted` is false so it can say so.
 */
const listeners = new Set<() => void>();
const inMemory = new Map<string, string>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readText(key: string): string | null {
  const kept = inMemory.get(key);
  if (kept !== undefined) return kept;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The saved presets of one kind of report, stored under `storageKey`. */
export function useReportPresets(storageKey: string, today: string) {
  const text = useSyncExternalStore(
    subscribe,
    () => readText(storageKey),
    () => null,
  );
  const saved = useMemo(() => parsePresetStore(text, today), [text, today]);
  const [persisted, setPersisted] = useState(true);
  const builtIn = useMemo(() => builtInPresets(today), [today]);

  const write = useCallback(
    (next: ReportPreset[]) => {
      const stored = savePresets(storageKey, next);
      if (stored) inMemory.delete(storageKey);
      else inMemory.set(storageKey, serializePresetStore(next));
      setPersisted(stored);
      listeners.forEach((notify) => notify());
    },
    [storageKey],
  );

  /** Returns an error message (an empty name), or null when saved. */
  const save = useCallback(
    (name: string, options: TransactionReportOptions): string | null => {
      const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const result = upsertPreset(saved, name, options, id);
      if (result.error) return result.error;
      write(result.presets);
      return null;
    },
    [saved, write],
  );

  /** Removes a preset and returns it, so the caller can offer to bring it back. */
  const remove = useCallback(
    (id: string): ReportPreset | null => {
      const gone = saved.find((p) => p.id === id) ?? null;
      if (gone) write(deletePreset(saved, id));
      return gone;
    },
    [saved, write],
  );

  const restore = useCallback((preset: ReportPreset) => write([...saved.filter((p) => p.id !== preset.id), preset]), [saved, write]);

  return { builtIn, saved, persisted, save, remove, restore };
}
