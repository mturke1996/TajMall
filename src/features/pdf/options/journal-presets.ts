'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  JOURNAL_STORAGE_KEY,
  builtInJournalPresets,
  deleteJournalPreset,
  parseJournalPresetStore,
  saveJournalPresets,
  serializeJournalPresetStore,
  upsertJournalPreset,
  type JournalPreset,
  type PeriodJournalOptions,
} from '@/lib/period-journal-options';

/**
 * Saved presets of the period journal dialog, kept in this browser's localStorage exactly like
 * useReportPresets does for the revenues and expenses dialogs (read through useSyncExternalStore, so a change
 * in another tab shows up and the server render and the first client render agree). When the browser refuses
 * to store them they are kept in memory for this visit and `persisted` is false.
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

export function useJournalPresets(today: string, storageKey: string = JOURNAL_STORAGE_KEY) {
  const text = useSyncExternalStore(
    subscribe,
    () => readText(storageKey),
    () => null,
  );
  const saved = useMemo(() => parseJournalPresetStore(text, today), [text, today]);
  const [persisted, setPersisted] = useState(true);
  const builtIn = useMemo(() => builtInJournalPresets(today), [today]);

  const write = useCallback(
    (next: JournalPreset[]) => {
      const stored = saveJournalPresets(storageKey, next);
      if (stored) inMemory.delete(storageKey);
      else inMemory.set(storageKey, serializeJournalPresetStore(next));
      setPersisted(stored);
      listeners.forEach((notify) => notify());
    },
    [storageKey],
  );

  /** Returns an error message (an empty name), or null when saved. */
  const save = useCallback(
    (name: string, options: PeriodJournalOptions): string | null => {
      const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const result = upsertJournalPreset(saved, name, options, id);
      if (result.error) return result.error;
      write(result.presets);
      return null;
    },
    [saved, write],
  );

  /** Removes a preset and returns it, so the caller can offer to bring it back. */
  const remove = useCallback(
    (id: string): JournalPreset | null => {
      const gone = saved.find((p) => p.id === id) ?? null;
      if (gone) write(deleteJournalPreset(saved, id));
      return gone;
    },
    [saved, write],
  );

  const restore = useCallback((preset: JournalPreset) => write([...saved.filter((p) => p.id !== preset.id), preset]), [saved, write]);

  return { builtIn, saved, persisted, save, remove, restore };
}
