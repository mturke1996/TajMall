'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { exchangePasswordRecoverySession } from '@/lib/supabase/recover-session';
import { toast } from 'sonner';

function formatUrlError(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = formatUrlError(searchParams.get('error'));

  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true);
        setChecking(false);
        setError(null);
      }
    });

    void (async () => {
      const result = await exchangePasswordRecoverySession(supabase);
      if (!active) return;
      if (result.ok) {
        setReady(true);
        setError(null);
      } else if (result.redirecting) {
        return;
      } else if (result.reason !== 'missing_token') {
        setError(result.reason);
      }
      setChecking(false);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    if (password !== confirm) {
      setError('تأكيد كلمة المرور لا يطابق الجديدة.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'تعذّر تحديث كلمة المرور.');
        return;
      }
      toast.success('تم تعيين كلمة المرور الجديدة');
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-ink-mute" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="relative flex min-h-[100dvh] items-center justify-center p-6 paper" dir="rtl">
        <div className="surface w-full max-w-md space-y-4 p-7 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-pastel-redInk" />
          <h1 className="text-lg font-semibold">رابط غير صالح أو منتهٍ</h1>
          <p className="text-sm text-ink-mute">
            {error ?? 'اطلب رابط استعادة جديداً من صفحة «نسيت كلمة المرور».'}
          </p>
          <Button asChild className="w-full">
            <Link href="/login/forgot-password">طلب رابط جديد</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center p-6 paper" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="surface flex flex-col gap-6 p-7 sm:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Logo size="lg" />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[20px] font-semibold tracking-tight">كلمة مرور جديدة</h1>
              <p className="text-[13px] text-ink-mute">اختر كلمة مرور قوية — لا حاجة للكلمة القديمة.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-mute hover:bg-secondary"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-pastel-redInk/15 bg-pastel-red px-3 py-2 text-[12.5px] text-pastel-redInk">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              حفظ كلمة المرور الجديدة
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
