'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  builtInPresets,
  deletePreset,
  loadPresets,
  savePresets,
  upsertPreset,
  type ReportPreset,
  type TransactionReportOptions,
} from '@/lib/report-options';

/**
 * The saved presets of one kind of report, kept in this browser's localStorage under `storageKey`.
 * Storage that is missing or refuses (a private window, blocked site data) never throws: the presets then
 * live for this visit only and `persisted` is false so the bar can say so. Saved presets are read after
 * the first render, so the server and the first client render agree.
 */
export function useReportPresets(storageKey: string, today: string) {
  const [saved, setSaved] = useState<ReportPreset[]>([]);
  const [persisted, setPersisted] = useState(true);

  useEffect(() => {
    setSaved(loadPresets(storageKey, today));
  }, [storageKey, today]);

  const builtIn = useMemo(() => builtInPresets(today), [today]);

  /** Returns an error message (an empty name), or null when saved. */
  const save = useCallback(
    (name: string, options: TransactionReportOptions): string | null => {
      const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const result = upsertPreset(saved, name, options, id);
      if (result.error) return result.error;
      setSaved(result.presets);
      setPersisted(savePresets(storageKey, result.presets));
      return null;
    },
    [saved, storageKey],
  );

  /** Removes a preset and returns it, so the caller can offer to bring it back. */
  const remove = useCallback(
    (id: string): ReportPreset | null => {
      const gone = saved.find((p) => p.id === id) ?? null;
      if (!gone) return null;
      const next = deletePreset(saved, id);
      setSaved(next);
      setPersisted(savePresets(storageKey, next));
      return gone;
    },
    [saved, storageKey],
  );

  const restore = useCallback(
    (preset: ReportPreset) => {
      const next = [...saved.filter((p) => p.id !== preset.id), preset];
      setSaved(next);
      setPersisted(savePresets(storageKey, next));
    },
    [saved, storageKey],
  );

  return { builtIn, saved, persisted, save, remove, restore };
}
