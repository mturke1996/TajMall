'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('أدخل البريد الإلكتروني.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'تعذّر إرسال رابط الاستعادة.');
        return;
      }
      setSent(true);
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center p-6 paper" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="surface flex flex-col gap-6 p-7 sm:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Logo size="lg" />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[20px] font-semibold tracking-tight">استعادة كلمة المرور</h1>
              <p className="text-[13px] leading-[1.6] text-ink-mute">
                أدخل بريد حسابك — سنرسل رابطاً لتعيين كلمة مرور جديدة{' '}
                <strong>بدون الحاجة للكلمة القديمة</strong>.
              </p>
            </div>
          </div>

          {sent ? (
            <div className="flex flex-col gap-4 rounded-md border border-pastel-greenInk/15 bg-pastel-green px-4 py-4 text-[13px] text-pastel-greenInk">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">تم إرسال الرابط</p>
                  <p>
                    إن كان البريد <span dir="ltr">{email.trim()}</span> مسجّلاً، ستصلك رسالة
                    خلال دقائق. افتح الرابط واختر كلمة مرور جديدة.
                  </p>
                  <p className="text-[12px] opacity-90">تحقّق من مجلد الرسائل غير المرغوب فيها.</p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">العودة لتسجيل الدخول</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-ink-mute" />
                  البريد الإلكتروني
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@tajmall.ly"
                  autoComplete="email"
                  required
                  dir="ltr"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-pastel-redInk/15 bg-pastel-red px-3 py-2 text-[12.5px] text-pastel-redInk">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" size="lg" disabled={loading} className="gap-1.5">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                إرسال رابط الاستعادة
              </Button>

              <Button asChild variant="ghost" className="gap-1.5">
                <Link href="/login">
                  <ArrowRight className="h-4 w-4" />
                  العودة لتسجيل الدخول
                </Link>
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
