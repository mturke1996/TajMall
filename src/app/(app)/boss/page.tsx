'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Users, Crown, Search, Loader2, Mail, Check, X, Edit2, Shield } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProfiles, useUpdateProfile, qk } from '@/lib/db/queries';
import { useQueryClient } from '@tanstack/react-query';
import { SYSTEM_ROLES } from '@/lib/constants';
import { useUser } from '@/lib/supabase/use-user';
import { usePermission } from '@/lib/supabase/use-permission';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function BossPage() {
  const { user } = useUser();
  const { can } = usePermission();
  const { data: profiles, isLoading } = useProfiles();
  const updateProfile = useUpdateProfile();
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  
  // Edit mode states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  const users = profiles ?? [];

  // Filter users by search
  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.full_name_ar?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

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
          role: 'cashier',
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'فشل');
        return;
      }
      toast.success('تمت الدعوة بنجاح');
      setInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      await qc.invalidateQueries({ queryKey: qk.profiles });
    } catch {
      toast.error('تعذّر الاتصال');
    } finally {
      setInviteBusy(false);
    }
  }

  function startEdit(user: { id: string; full_name_ar: string | null; role: string | null }) {
    setEditingId(user.id);
    setEditName(user.full_name_ar || '');
    setEditRole(user.role || 'viewer');
  }

  async function saveEdit(id: string) {
    try {
      await updateProfile.mutateAsync({ id, full_name_ar: editName, role: editRole });
      toast.success('تم التحديث');
      setEditingId(null);
    } catch {
      toast.error('فشل التحديث');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditRole('');
  }

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="إدارة المستخدمين"
        description="إضافة وتعديل أعضاء الفريق"
        actions={
          <div className="flex flex-wrap gap-2">
            {can('org.audit') && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/audit-log" prefetch>
                  <Shield className="h-4 w-4 ml-1" />
                  سجل الرقابة
                </Link>
              </Button>
            )}
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              إضافة
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {/* Stats */}
        <Card className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas-sunken text-sage-700">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-ink-mute">المستخدمون</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <Input
            placeholder="البحث في المستخدمين..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>

        {/* Users List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <Card className="p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-ink-mute" />
            <p className="mt-2 text-ink-mute">لا يوجد مستخدمين</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredUsers.map((u) => (
              <div
                key={u.id}
                className="surface flex items-center justify-between gap-3 rounded-lg p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas-sunken text-base font-bold text-sage-700">
                    {(u.full_name_ar?.[0] || u.full_name?.[0] || '?')}
                  </div>
                  <div className="min-w-0">
                    {editingId === u.id ? (
                      <div className="flex flex-col gap-1.5">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8"
                        />
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="h-8 rounded border px-2 text-sm"
                        >
                          {SYSTEM_ROLES.map((r) => (
                            <option key={r.name} value={r.name}>{r.nameAr}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium truncate">
                          {u.full_name_ar || u.full_name || 'بدون اسم'}
                        </p>
                        <p className="text-xs text-ink-mute">
                          {u.role === 'owner' ? 'المدير' : u.role === 'admin' ? 'مساعد' : u.role === 'cashier' ? 'أمين صندوق' : 'مشاهد'}
                          {u.id === user?.id && ' · أنت'}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {editingId === u.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveEdit(u.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={cancelEdit}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(u)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" />
              دعوة مستخدم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
            <div>
              <Label>الاسم</Label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setInviteOpen(false)}>إلغاء</Button>
            <Button className="flex-1" onClick={submitInvite} disabled={inviteBusy}>
              {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'دعوة'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
