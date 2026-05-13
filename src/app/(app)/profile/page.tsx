'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Building2, Save, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useCurrentProfile } from '@/lib/supabase/use-profile';
import { useUpdateProfile } from '@/lib/db/queries';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { profile, user, loading } = useCurrentProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Update local state when profile loads
  useEffect(() => {
    if (profile?.full_name_ar) {
      setName(profile.full_name_ar);
    }
  }, [profile?.full_name_ar]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({
        id: profile.id,
        full_name_ar: name,
      });
      toast.success('تم تحديث الملف الشخصي');
    } catch {
      toast.error('فشل التحديث');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="الحساب"
        title="الملف الشخصي"
        description="إدارة بياناتك الشخصية"
      />

      <div className="mx-auto max-w-2xl p-4 md:p-8">
        {/* بطاقة الملف الشخصي الرئيسية */}
        <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-br from-sage-50 to-white shadow-xl">
          {/* Header with avatar */}
          <div className="relative h-32 bg-gradient-to-r from-sage-600 to-sage-700">
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white shadow-lg">
                <span className="text-4xl font-bold text-sage-700">
                  {(name || profile?.full_name || user?.email?.[0] || '?')[0]}
                </span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="pt-16 pb-8 px-6">
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-gray-900">
                {name || profile?.full_name || 'مستخدم'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
            </div>

            {/* Form */}
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <User className="h-4 w-4 text-sage-600" />
                  الاسم الكامل
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="أدخل اسمك بالعربية"
                  className="h-12 rounded-xl border-gray-200 bg-white text-right shadow-sm transition-all focus:border-sage-500 focus:ring-sage-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Mail className="h-4 w-4 text-sage-600" />
                  البريد الإلكتروني
                </Label>
                <Input
                  value={user?.email || ''}
                  disabled
                  className="h-12 rounded-xl border-gray-200 bg-gray-50 text-right"
                />
                <p className="text-xs text-gray-400">لا يمكن تغيير البريد الإلكتروني</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Building2 className="h-4 w-4 text-sage-600" />
                  الدور الوظيفي
                </Label>
                <Input
                  value={profile?.role === 'owner' ? 'المدير' : profile?.role === 'admin' ? 'مساعد' : profile?.role === 'cashier' ? 'أمين صندوق' : 'مشاهد'}
                  disabled
                  className="h-12 rounded-xl border-gray-200 bg-gray-50 text-right"
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || !profile}
                className="w-full h-12 mt-4 rounded-xl bg-sage-700 hover:bg-sage-800 text-white font-medium shadow-lg shadow-sage-700/20 transition-all active:scale-[0.98]"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Save className="h-5 w-5 mr-2" />
                    حفظ التغييرات
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 rounded-2xl border-0 bg-white/80 p-6 shadow-lg backdrop-blur">
          <h3 className="font-semibold text-gray-900 mb-2">معلومات الحساب</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            يمكنك تحديث اسمك الظاهر في النظام. البريد الإلكتروني والدور الوظيفي يتم إدارتهما من قبل المدير.
          </p>
        </Card>
      </div>
    </>
  );
}
