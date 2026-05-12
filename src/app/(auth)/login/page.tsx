'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Eye, EyeOff, Facebook, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

/**
 * The /login route splits the search-param-reading form into a Suspense
 * boundary so the outer shell can statically render. Without this, Next 14
 * refuses to prerender the page.
 */
export default function LoginPage() {
  return (
    <div
      className="relative flex min-h-[100dvh] items-center justify-center p-6 paper"
      dir="rtl"
    >
      <Suspense fallback={<LoginCardSkeleton />}>
        <LoginCard />
      </Suspense>
    </div>
  );
}

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const nextHref = params.get('next') || '/dashboard';

  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      setError('الرجاء إدخال البريد وكلمة المرور.');
      setLoading(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const friendly = /invalid login credentials/i.test(error.message)
          ? 'البريد أو كلمة المرور غير صحيحين.'
          : /email not confirmed/i.test(error.message)
            ? 'لم يتم تأكيد البريد الإلكتروني بعد. تفقّد صندوق الوارد.'
            : error.message;
        setError(friendly);
        setLoading(false);
        return;
      }

      toast.success('تم تسجيل الدخول بنجاح');
      router.push(nextHref);
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('تعذّر الاتصال بالخادم. تحقّق من اتصال الإنترنت.');
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md"
    >
      <div className="surface flex flex-col gap-7 p-7 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <Logo size="lg" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[20px] font-semibold tracking-tight">
              مرحباً بك في {BRAND.name}
            </h1>
            <p className="text-[13px] leading-[1.6] text-ink-mute">
              {BRAND.tagline} · {BRAND.region}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="example@tajmall.ly"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">كلمة المرور</Label>
              <Link href="#" className="text-[12px] text-sage-700 hover:underline">
                نسيت كلمة المرور؟
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-mute transition-colors duration-150 hover:bg-secondary hover:text-foreground"
                aria-label="إظهار كلمة المرور"
              >
                {showPwd ? (
                  <EyeOff className="h-4 w-4 stroke-[1.5]" />
                ) : (
                  <Eye className="h-4 w-4 stroke-[1.5]" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-md border border-pastel-redInk/15 bg-pastel-red px-3 py-2 text-[12.5px] text-pastel-redInk"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 stroke-[1.7]" />
              <span>{error}</span>
            </motion.div>
          )}

          <Button type="submit" size="lg" disabled={loading} className="mt-1 gap-1.5">
            {loading && <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />}
            تسجيل الدخول
          </Button>
        </form>

        <div className="flex flex-col gap-3 border-t border-border pt-5 text-center">
          <a
            href={BRAND.socials.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-[12px] text-ink-mute transition-colors duration-150 hover:text-sage-700"
          >
            <Facebook className="h-3.5 w-3.5 stroke-[1.6]" />
            تابعنا على فيسبوك
          </a>
          <p className="text-[11px] text-ink-mute">
            © {new Date().getFullYear()} {BRAND.fullName}. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function LoginCardSkeleton() {
  return (
    <div className="w-full max-w-md">
      <div className="surface flex flex-col gap-7 p-7 sm:p-8">
        <div className="flex flex-col items-center gap-5">
          <div className="shimmer h-11 w-11 rounded-md" />
          <div className="flex flex-col gap-1.5 items-center">
            <div className="shimmer h-5 w-48 rounded" />
            <div className="shimmer h-3.5 w-64 rounded" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="shimmer h-10 w-full rounded-md" />
          <div className="shimmer h-10 w-full rounded-md" />
          <div className="shimmer h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
