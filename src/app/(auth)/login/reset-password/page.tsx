'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center" dir="rtl">
          <Loader2 className="h-6 w-6 animate-spin text-ink-mute" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
