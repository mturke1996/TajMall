'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useProfiles, useUpdateProfile, qk } from '@/lib/db/queries';
import { useQueryClient } from '@tanstack/react-query';
import { SYSTEM_ROLES } from '@/lib/constants';
import { useUser } from '@/lib/supabase/use-user';
import { toast } from 'sonner';

export default function UsersPage() {
  const { user } = useUser();
  const { data: profiles, isLoading } = useProfiles();
  const updateProfile = useUpdateProfile();
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [inviteBusy, setInviteBusy] = useState(false);

  const rows = useMemo(() => profiles ?? [], [profiles]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (a.full_name_ar ?? '').localeCompare(b.full_name_ar ?? '', 'ar')),
    [rows],
  );

  async function submitInvite() {
    if (!inviteEmail.trim()) {
      toast.error('أدخل البريد الإلكتروني');
      return;
    }
    setInviteBusy(true);
    try {
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          full_name_ar: inviteName.trim() || inviteEmail.split('@')[0],
          role: inviteRole,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'تعذّر إرسال الدعوة');
        return;
      }
      toast.success('تم إرسال الدعوة إلى البريد');
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('viewer');
      await qc.invalidateQueries({ queryKey: qk.profiles });
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally {
      setInviteBusy(false);
    }
  }

  async function onRoleChange(profileId: string, role: string) {
    try {
      await updateProfile.mutateAsync({ id: profileId, role });
      toast.success('تم تحديث الدور');
    } catch (e) {
      toast.error('تعذّر حفظ الدور', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="المستخدمون"
        description="عرض فريق العمل، تعديل الأدوار، ودعوة أعضاء جدد بالبريد (يتطلب إعداد SMTP في Supabase)."
        actions={
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setInviteOpen(true)}>
            <Plus className="stroke-[1.6]" />
            دعوة مستخدم
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
            جارٍ التحميل…
          </div>
        )}

        {!isLoading && !sorted.length && (
          <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Users className="h-8 w-8 text-ink-mute stroke-[1.4]" />
            <p className="text-[14px] text-ink-mute">لا توجد ملفات مستخدمين بعد.</p>
          </div>
        )}

        {/* Mobile cards */}
        {!isLoading && sorted.length > 0 && (
          <ul className="flex flex-col gap-2.5 md:hidden">
            {sorted.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.25) }}
                className="surface flex flex-col gap-3 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">
                      {p.full_name_ar ?? p.full_name ?? 'بدون اسم'}
                    </p>
                    <p className="truncate font-mono text-[11px] text-ink-mute">{p.id.slice(0, 8)}…</p>
                  </div>
                  {p.id === user?.id ? (
                    <Badge variant="neutral">أنت</Badge>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[11px] text-ink-mute">الدور</Label>
                  <Select
                    value={p.role ?? 'viewer'}
                    onValueChange={(v) => onRoleChange(p.id, v)}
                    disabled={p.id === user?.id}
                  >
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_ROLES.map((r) => (
                        <SelectItem key={r.name} value={r.name}>
                          {r.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </motion.li>
            ))}
          </ul>
        )}

        {/* Desktop table */}
        {!isLoading && sorted.length > 0 && (
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-canvas-sunken text-start">
                  <th className="px-4 py-3 font-semibold text-ink-mute">الاسم</th>
                  <th className="px-4 py-3 font-semibold text-ink-mute">المعرّف</th>
                  <th className="px-4 py-3 font-semibold text-ink-mute">الدور</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{p.full_name_ar ?? p.full_name ?? '—'}</span>
                      {p.id === user?.id ? (
                        <Badge variant="neutral" className="ms-2 text-[10px]">
                          أنت
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-mute">
                      {p.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={p.role ?? 'viewer'}
                        onValueChange={(v) => onRoleChange(p.id, v)}
                        disabled={p.id === user?.id}
                      >
                        <SelectTrigger className="h-10 w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEM_ROLES.map((r) => (
                            <SelectItem key={r.name} value={r.name}>
                              {r.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[12px] leading-relaxed text-ink-mute">
          لإكمال تسجيل المدعو، تأكد من تفعيل البريد في Supabase (Authentication → Providers →
          Email) ومن ضبط قوالب البريد أو SMTP. يمكنك مؤقتاً إنشاء مستخدم من لوحة Supabase ثم
          تعيين اسمه ودوره من الجدول أعلاه.
        </p>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[min(90dvh,640px)] overflow-y-auto sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>دعوة مستخدم</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-ink-mute">
              يُرسل رابطاً على البريد لإنهاء التسجيل. يتطلب ذلك مفتاح الخدمة وإعداد البريد في
              المشروع.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-email">البريد الإلكتروني</Label>
              <Input
                id="inv-email"
                type="email"
                autoComplete="off"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-name">الاسم المعروض</Label>
              <Input
                id="inv-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="الاسم بالعربية"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>الدور عند أول دخول</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYSTEM_ROLES.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              إلغاء
            </Button>
            <Button type="button" className="gap-1.5" disabled={inviteBusy} onClick={submitInvite}>
              {inviteBusy && <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />}
              إرسال الدعوة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
