'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Database,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { usePermission } from '@/lib/supabase/use-permission';
import { runColdBackup } from '@/lib/backup/run-cold-backup';
import {
  exportBackupCopy,
  isTauriDesktop,
  listColdBackups,
  revealBackupsFolder,
  type BackupInfo,
} from '@/lib/backup/tauri-bridge';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-LY', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function BackupSettingsPage() {
  const supabase = useSupabase();
  const { role, loading: roleLoading } = usePermission();
  const [desktop, setDesktop] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const canBackup = role === 'owner' || role === 'admin';

  const refreshList = useCallback(async () => {
    if (!isTauriDesktop()) {
      setBackups([]);
      return;
    }
    setLoadingList(true);
    try {
      const items = await listColdBackups();
      setBackups(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    setDesktop(isTauriDesktop());
    void refreshList();
  }, [refreshList]);

  async function handleCreate() {
    if (!canBackup) {
      toast.error('النسخ الاحتياطي متاح لمديري النظام فقط.');
      return;
    }
    setCreating(true);
    try {
      const result = await runColdBackup(supabase, role);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `تم حفظ النسخة (${result.info.totalRows.toLocaleString('ar')} صف · ${formatBytes(result.info.zipBytes)})`,
      );
      await refreshList();
    } finally {
      setCreating(false);
    }
  }

  async function handleReveal() {
    try {
      const path = await revealBackupsFolder();
      toast.message('مجلد النسخ', { description: path });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExport(id: string) {
    setExportingId(id);
    try {
      const dest = await exportBackupCopy(id);
      if (dest) {
        toast.success('تم حفظ ملف ZIP');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="الإعدادات"
        title="النسخ الاحتياطي المحلي"
        description="لقطة باردة على جهازك للطوارئ أو النقل لاستضافة أخرى — التطبيق يبقى يعمل من Supabase."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" />
              رجوع
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <div className="flex gap-3 border border-border bg-canvas-sunken/40 px-4 py-3 text-[13px] leading-relaxed text-ink-mute">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-sage-700" />
          <p>
            هذه النسخة للطوارئ فقط ولا يستخدمها التطبيق أثناء التشغيل. البيانات الحية تُقرأ
            وتُكتب من Supabase كالمعتاد. احفظ ملف ZIP خارج الجهاز (USB أو قرص خارجي) عند الحاجة.
          </p>
        </div>

        {!desktop && (
          <div className="surface flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 text-ink-mute" />
              <div className="flex flex-col gap-1">
                <h2 className="text-[14px] font-semibold">تطبيق سطح المكتب مطلوب</h2>
                <p className="text-[12.5px] leading-relaxed text-ink-mute">
                  النسخ الاحتياطي المحلي (SQLite + ZIP على الجهاز) يعمل فقط داخل تطبيق{' '}
                  <strong className="font-semibold text-foreground">Taj Mall</strong> على سطح
                  المكتب. من المتصفح يمكنك الاعتماد على النسخ اليومية عبر GitHub Actions الموضّحة
                  في توثيق المشروع.
                </p>
              </div>
            </div>
          </div>
        )}

        {desktop && (
          <>
            <div className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="text-[14px] font-semibold">إنشاء نسخة الآن</h2>
                <p className="text-[12.5px] text-ink-mute">
                  يسحب كل جداول الأعمال من Supabase ويحفظها في مجلد بيانات التطبيق.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleReveal()}
                  disabled={creating}
                >
                  <FolderOpen className="h-4 w-4" />
                  فتح المجلد
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleCreate()}
                  disabled={creating || roleLoading || !canBackup}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  إنشاء نسخة احتياطية
                </Button>
              </div>
            </div>

            {!roleLoading && !canBackup && (
              <p className="text-[12.5px] text-ink-mute">
                حسابك الحالي ({role}) لا يملك صلاحية إنشاء نسخة كاملة. اطلب من المدير (owner /
                admin).
              </p>
            )}

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                  النسخ المحفوظة على هذا الجهاز
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refreshList()}
                  disabled={loadingList}
                >
                  {loadingList ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  تحديث
                </Button>
              </div>

              {backups.length === 0 && !loadingList && (
                <p className="text-[13px] text-ink-mute">لا توجد نسخ محلية بعد.</p>
              )}

              <ul className="flex flex-col gap-2">
                {backups.map((b) => (
                  <li
                    key={b.id}
                    className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13.5px] font-semibold tracking-tight">
                        {formatDate(b.createdAt)}
                      </span>
                      <span className="text-[12px] text-ink-mute">
                        {b.totalRows.toLocaleString('ar')} صف · ZIP {formatBytes(b.zipBytes)} ·
                        SQLite {formatBytes(b.sqliteBytes)}
                      </span>
                      <span className="truncate font-mono text-[11px] text-ink-mute">
                        {b.id}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleExport(b.id)}
                      disabled={exportingId === b.id}
                    >
                      {exportingId === b.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <HardDriveDownload className="h-4 w-4" />
                      )}
                      حفظ ZIP…
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
