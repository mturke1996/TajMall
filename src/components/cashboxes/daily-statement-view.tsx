'use client';

import { cn, formatMoney } from '@/lib/utils';
import { type DailyBox, type DailyLine, type DailyStatement } from '@/lib/daily-cashbox';

const KIND_LABEL: Record<DailyLine['kind'], string> = {
  receipt: 'قبض',
  payment: 'صرف',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
};

const AMOUNT_TONE: Record<DailyLine['kind'], string> = {
  receipt: 'text-success-ink',
  payment: 'text-danger-ink',
  transfer_in: 'text-foreground',
  transfer_out: 'text-foreground',
};

function Figure({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'in' | 'out' }) {
  return (
    <div className="bg-card p-4">
      <p className="text-[12.5px] text-ink-mute">{label}</p>
      <p className={cn('mt-1 text-[18px] font-semibold tabular-nums text-foreground', tone === 'in' && 'text-success-ink', tone === 'out' && 'text-danger-ink')}>{children}</p>
    </div>
  );
}

/** under the title: what kind of movement it is (unless the title already says so), its number, the other box */
function lineNote(l: DailyLine) {
  const other = l.counter ? (l.kind === 'transfer_in' ? `من ${l.counter}` : `إلى ${l.counter}`) : null;
  return [l.description ? KIND_LABEL[l.kind] : null, l.ref, other].filter(Boolean).join(' · ');
}

function BoxSection({ box }: { box: DailyBox }) {
  return (
    <section aria-labelledby={`box-${box.id}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 id={`box-${box.id}`} className="text-[15px] font-semibold text-foreground">
          {box.name}
        </h2>
        <p className="text-[12.5px] tabular-nums text-ink-mute">
          الافتتاحي {formatMoney(box.opening, 'LYD')} · الختامي <span className="font-semibold text-foreground">{formatMoney(box.closing, 'LYD')}</span>
        </p>
      </div>
      <div className="surface overflow-hidden">
        {box.lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ink-mute">لا حركة في هذا اليوم.</p>
        ) : (
          <ul className="divide-y divide-border">
            {box.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-foreground">{l.description ?? KIND_LABEL[l.kind]}</span>
                  {lineNote(l) && <span className="block text-[12px] text-ink-mute">{lineNote(l)}</span>}
                </span>
                <span className="shrink-0 text-end">
                  <span className={cn('block text-[13.5px] font-medium tabular-nums', AMOUNT_TONE[l.kind])}>{formatMoney(l.amount, 'LYD')}</span>
                  <span className="block text-[12px] tabular-nums text-ink-mute">الرصيد {formatMoney(l.balanceAfter, '')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {(box.receipts > 0 || box.payments > 0 || box.transfersIn > 0 || box.transfersOut > 0) && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border bg-canvas-sunken/40 px-4 py-2.5 text-[12.5px] sm:grid-cols-4">
            {[
              ['قبض', box.receipts],
              ['صرف', box.payments],
              ['تحويلات واردة', box.transfersIn],
              ['تحويلات صادرة', box.transfersOut],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-mute">{label}</dt>
                <dd className="tabular-nums text-foreground">{(value as number) > 0 ? formatMoney(value as number, '') : '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {!box.reconciles && <p className="px-1 text-[12.5px] text-warning-ink">حركة هذا اليوم لا تطابق فرق الرصيد في دفتر الخزينة؛ راجع الدفتر قبل اعتماد الكشف.</p>}
      {box.matchesCurrent === false && <p className="px-1 text-[12.5px] text-warning-ink">الرصيد الختامي هنا لا يساوي رصيد الخزينة الحالي؛ حدّث الصفحة وإن بقي الفرق راجع الدفتر.</p>}
    </section>
  );
}

/** One day of every cashbox: the handover sheet on screen. */
export function DailyStatementView({ statement }: { statement: DailyStatement }) {
  const t = statement.totals;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Figure label="الافتتاحي">{formatMoney(t.opening, 'LYD')}</Figure>
        <Figure label="قبض" tone="in">
          {formatMoney(t.receipts, 'LYD')}
        </Figure>
        <Figure label="صرف" tone="out">
          {formatMoney(t.payments, 'LYD')}
        </Figure>
        <Figure label="الختامي">{formatMoney(t.closing, 'LYD')}</Figure>
      </div>
      <p className="-mt-3 px-1 text-[12px] text-ink-mute">القبض والصرف لا يشملان التحويلات بين الخزائن.</p>

      {!statement.allReconcile && (
        <p role="alert" className="rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
          أرقام هذا الكشف لا تطابق دفتر الخزينة في خزينة أو أكثر. راجع الملاحظات تحت كل خزينة قبل اعتماده أو إرساله.
        </p>
      )}

      {statement.boxes.length === 0 ? (
        <p className="surface px-4 py-10 text-center text-[13px] text-ink-mute">لا توجد خزائن لعرضها.</p>
      ) : (
        statement.boxes.map((box) => <BoxSection key={box.id} box={box} />)
      )}
    </div>
  );
}
