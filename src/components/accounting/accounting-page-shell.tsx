'use client';

import { AccountingSubNav } from './accounting-sub-nav';
import { AccountingFlowHint } from './accounting-flow-hint';
import { usePermission } from '@/lib/supabase/use-permission';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function AccountingPageShell({ children }: { children: React.ReactNode }) {
  const { can, loading } = usePermission();

  const canSeeAccounting =
    !loading &&
    (can('journal.view') || can('account.view') || can('account.manage'));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <AccountingSubNav />
      {!loading && !canSeeAccounting && (
        <div className="px-4 py-6 sm:px-5 md:px-8">
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">لا توجد صلاحية للمحاسبة والتقارير</p>
            <p className="mt-1 text-xs text-amber-800">
              اطلب من المسؤول تفعيل journal.view أو account.view.
            </p>
            <Button variant="outline" size="sm" className="mt-3 min-h-10 touch-manipulation" asChild>
              <Link href="/dashboard">العودة للوحة التحكم</Link>
            </Button>
          </Card>
        </div>
      )}
      {canSeeAccounting && (
        <>
          <div className="hidden px-4 pt-3 sm:block sm:px-5 md:px-8">
            <AccountingFlowHint />
          </div>
          {children}
        </>
      )}
    </div>
  );
}
