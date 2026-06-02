'use client';

import Link from 'next/link';
import { Loader2, Lock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { usePermission } from '@/lib/supabase/use-permission';

export default function AuditLogPage() {
  const { can, loading: permLoading } = usePermission();
  const allowed = can('org.audit');

  if (permLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" aria-hidden />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <Lock className="h-12 w-12 text-ink-mute" aria-hidden />
        <h1 className="text-lg font-semibold">سجل الرقابة — للمالك والمدير فقط</h1>
        <p className="max-w-sm text-sm text-ink-mute">
          يعرض كل حركة مع رصيد الخزائن بعدها، بما في ذلك الحذف.
        </p>
        <Button variant="outline" asChild>
          <Link href="/dashboard">العودة للوحة التحكم</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="سجل الرقابة"
        description="كل حركة مع الرصيد بعدها — للمالك ومدير النظام."
      />

      <div className="px-4 py-5 sm:px-5 md:px-8 md:py-8">
        <AuditLogView />
      </div>
    </>
  );
}
