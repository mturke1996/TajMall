'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { usePermission } from '@/lib/supabase/use-permission';
import { runColdBackup, shouldRunAutoBackup } from '@/lib/backup/run-cold-backup';
import { isTauriDesktop, listColdBackups } from '@/lib/backup/tauri-bridge';

/**
 * Quiet cold backup when the desktop app opens (at most once every 24h).
 * Never blocks the UI; failures are logged / toasted lightly.
 */
export function AutoColdBackup() {
  const supabase = useSupabase();
  const { role, loading } = usePermission();
  const ran = useRef(false);

  useEffect(() => {
    if (loading || ran.current) return;
    if (!isTauriDesktop()) return;
    if (role !== 'owner' && role !== 'admin') return;

    ran.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const existing = await listColdBackups();
        if (cancelled) return;
        const latest = existing[0]?.createdAt;
        if (!shouldRunAutoBackup(latest)) return;

        const result = await runColdBackup(supabase, role);
        if (cancelled) return;
        if (result.ok) {
          toast.message('نسخة احتياطية محلية', {
            description: `حُفظت لقطة باردة (${result.info.totalRows.toLocaleString('ar')} صف).`,
          });
        } else {
          console.warn('[auto-cold-backup]', result.error);
        }
      } catch (err) {
        console.warn('[auto-cold-backup]', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, role, supabase]);

  return null;
}
