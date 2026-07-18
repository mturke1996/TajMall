'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Building2, Save, Loader2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCurrentProfile } from '@/lib/supabase/use-profile';
import { useUpdateProfile } from '@/lib/db/queries';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { toast } from 'sonner';

const ROLE_LABEL: Record<string, string> = {
  owner: 'المدير',
  admin: 'مساعد',
  accountant: 'محاسب',
  cashier: 'أمين صندوق',
  viewer: 'مشاهد',
};

export default function ProfilePage() {
  const { profile, user, loading } = useCurrentProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.full_name_ar) setName(profile.full_name_ar);
  }, [profile?.full_name_ar]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ink-mute" />
      </div>
    );
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ id: profile.id, full_name_ar: name });
      toast.success('تم تحديث الملف الشخصي');
    } catch {
      toast.error('فشل التحديث');
    } finally {
      setSaving(false);
    }
  }

  const displayName = name || profile?.full_name || 'مستخدم';
  const initial = (displayName || user?.email?.[0] || '?')[0];
  const roleLabel = ROLE_LABEL[profile?.role ?? 'viewer'] ?? 'مشاهد';

  return (
    <>
      <PageHeader eyebrow="الحساب" title="الملف الشخصي" description="إدارة بياناتك الشخصية" />

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 sm:px-5 sm:py-5 md:px-8 md:py-6">
        {/* Identity — compact, app-style (no marketing hero) */}
        <div className="surface flex items-center gap-3 p-4 sm:gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border bg-canvas-sunken text-[18px] font-bold text-sage-700">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold text-ink">{displayName}</h2>
            <p className="truncate text-[12.5px] text-ink-mute" dir="ltr">
              {user?.email}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-sage-600" />
              <Badge variant="outline" className="text-[10px]">
                {roleLabel}
              </Badge>
            </div>
          </div>
        </div>

        {/* Edit form */}
        <div className="surface space-y-4 p-4 sm:p-5">
          <h3 className="text-[13px] font-semibold text-ink">تعديل البيانات</h3>

          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <User className="h-3.5 w-3.5 text-ink-mute" />
              الاسم الكامل
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسمك بالعربية"
              className="min-h-11 touch-manipulation"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <Mail className="h-3.5 w-3.5 text-ink-mute" />
              البريد الإلكتروني
            </Label>
            <Input value={user?.email || ''} disabled dir="ltr" className="min-h-11" />
            <p className="text-[11px] text-ink-mute">لا يمكن تغيير البريد الإلكتروني</p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <Building2 className="h-3.5 w-3.5 text-ink-mute" />
              الدور الوظيفي
            </Label>
            <Input value={roleLabel} disabled className="min-h-11" />
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !profile}
            className="w-full min-h-11 gap-2 touch-manipulation sm:w-auto"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ التغييرات
          </Button>
        </div>

        {user?.email ? (
          <div id="password" className="surface scroll-mt-20 space-y-4 p-4 sm:p-5">
            <div>
              <h3 className="text-[13px] font-semibold text-ink">كلمة المرور</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
                غيّر كلمة مرور حسابك بعد التحقق من الكلمة الحالية.
              </p>
            </div>
            <ChangePasswordForm email={user.email} />
          </div>
        ) : null}

        <p className="px-1 text-[12px] leading-relaxed text-ink-mute">
          يمكنك تحديث اسمك الظاهر في النظام. البريد الإلكتروني والدور الوظيفي يُداران من قبل المدير.
        </p>
      </div>
    </>
  );
}
