'use client';

import { motion } from 'framer-motion';
import { Plus, Wallet, Landmark, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { useCashboxBalances } from '@/lib/db/queries';
import { formatMoney, cn } from '@/lib/utils';
import { CashboxFormDialog } from '@/components/cashboxes/cashbox-form-dialog';
import { usePermission } from '@/lib/supabase/use-permission';

export default function CashboxesPage() {
  const [open, setOpen] = useState(false);
  const { can } = usePermission();
  const { data, isLoading } = useCashboxBalances();
  const items = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="الخزائن والمصارف"
        title="إدارة الخزائن"
        description="أنشئ خزائنك النقدية وحساباتك المصرفية، وتابع أرصدتها وحركتها اليومية."
        actions={
          can('cashbox.manage') ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setOpen(true)}
            >
              <Plus className="stroke-[1.6]" />
              خزينة جديدة
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-[12.5px] text-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
            جارٍ التحميل…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="لا توجد خزائن أو حسابات بعد"
            description="ابدأ بإنشاء الخزينة النقدية الرئيسية ثم أضف حسابات المصارف، أو شغّل ملف SQL في Supabase للحصول على الخزائن الافتراضية."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c, i) => {
              const Icon = c.kind === 'CASH' ? Wallet : Landmark;
              const balance = Number(c.balance);
              const inflow = Number(c.month_inflow);
              const outflow = Number(c.month_outflow);
              const net = inflow - outflow;
              return (
                <motion.article
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.4 }}
                  className="surface flex flex-col gap-5 p-5"
                >
                  <header className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-10 w-10 place-items-center rounded-md border"
                        style={{
                          background: `${c.color ?? '#6E7470'}1f`,
                          borderColor: `${c.color ?? '#6E7470'}55`,
                        }}
                      >
                        <Icon
                          className="h-[16px] w-[16px] stroke-[1.5]"
                          style={{ color: c.color ?? undefined }}
                        />
                      </span>
                      <div className="flex flex-col">
                        <h3 className="text-[15px] font-semibold tracking-tight">
                          {c.name_ar}
                        </h3>
                        <span className="text-[11px] text-ink-mute">
                          {c.kind === 'CASH'
                            ? 'خزينة نقدية'
                            : `حساب مصرفي${c.bank_name ? ` · ${c.bank_name}` : ''}`}
                        </span>
                      </div>
                    </div>
                    <Badge variant="neutral" className="font-mono normal-case tracking-normal">
                      {c.code}
                    </Badge>
                  </header>

                  <div className="flex flex-col gap-1.5 border-y border-border py-4">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                      الرصيد الحالي
                    </span>
                    <span className="num text-[26px] font-semibold tracking-tight">
                      {formatMoney(balance, c.currency || 'LYD')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                        وارد الشهر
                      </span>
                      <span className="num font-semibold text-pastel-greenInk tabular-nums">
                        + {formatMoney(inflow, c.currency || 'LYD', { compact: true })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                        صادر الشهر
                      </span>
                      <span className="num font-semibold text-pastel-redInk tabular-nums">
                        − {formatMoney(outflow, c.currency || 'LYD', { compact: true })}
                      </span>
                    </div>
                  </div>

                  <footer className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-ink-mute">
                    <span>صافي الشهر</span>
                    <span
                      className={cn(
                        'num font-semibold tabular-nums',
                        net >= 0 ? 'text-pastel-greenInk' : 'text-pastel-redInk',
                      )}
                    >
                      {net >= 0 ? '+' : '−'}{' '}
                      {formatMoney(Math.abs(net), c.currency || 'LYD', { compact: true })}
                    </span>
                  </footer>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
      <CashboxFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
