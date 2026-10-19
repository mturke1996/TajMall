'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building } from 'lucide-react';
import { PartyAvatar, RoleBadge, CHIP } from '@/components/people';
import { Card } from '@/components/ui/card';
import { CallLink, PhoneNumber, RowMenu, VoucherButton, WhatsAppLink } from '@/components/contacts/directory/contact-actions';
import { LastMovement, TwelveMonths } from '@/components/contacts/directory/activity-cells';
import type { RowContext } from '@/components/contacts/directory/directory-types';
import { contactDetail, type DirectoryRow } from '@/lib/contacts/directory';
import { cn } from '@/lib/utils';

/** «مؤجر» says it in one word; every other role keeps the wording it has everywhere else. */
function RoleChip({ row }: { row: DirectoryRow }) {
  return <RoleBadge role={row.role} label={row.landlord ? 'مؤجر' : undefined} />;
}

function InactiveChip() {
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5', CHIP.neutral)}>غير نشط</span>;
}

/** Paid rent and never received money: the file may be a landlord that was never marked as one. */
function RentHint() {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium leading-5', CHIP.info)}
      title="دُفع لهذا الملف إيجار ولا يوجد إيراد منه في آخر 12 شهراً"
    >
      <Building className="h-3 w-3" aria-hidden />
      تُدفع له إيجارات
    </span>
  );
}

function canVoucherOf(row: DirectoryRow, ctx: RowContext) {
  return row.contact.is_active && ctx.canVoucher(row.direction);
}

/** One row of the wide table. The whole row opens the file; the name is the link the keyboard reaches. */
export const DirectoryTableRow = memo(function DirectoryTableRow({ row, ctx }: { row: DirectoryRow; ctx: RowContext }) {
  const router = useRouter();
  const c = row.contact;
  const detail = contactDetail(c);
  const canVoucher = canVoucherOf(row, ctx);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <tr
      onClick={() => router.push(`/contacts/${c.id}`)}
      className="cursor-pointer align-middle transition-colors hover:bg-canvas-sunken/60"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <PartyAvatar name={c.name} role={row.role} size="md" inactive={!c.is_active} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/contacts/${c.id}`}
                onClick={stop}
                className={cn('truncate rounded-sm text-[14px] font-semibold text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', !c.is_active && 'text-ink-mute')}
              >
                {c.name}
              </Link>
              {!c.is_active && <InactiveChip />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <RoleChip row={row} />
              {ctx.hintIds.has(c.id) && <RentHint />}
            </div>
            {(c.code || detail) && (
              <p className="mt-1 truncate text-[12px] text-ink-mute">
                {c.code && <span dir="ltr" className="tabular-nums">{c.code}</span>}
                {c.code && detail && ' · '}
                {detail}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3" onClick={stop}>
        <div className="flex items-center gap-1.5">
          <PhoneNumber phone={c.phone} className="text-[13px] text-foreground" />
          <WhatsAppLink contact={c} className="sm:h-8 sm:w-8" />
        </div>
        {c.email && (
          <p dir="ltr" className="mt-1 truncate text-start text-[12px] text-ink-mute">
            {c.email}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <LastMovement row={row} state={ctx.activityState} />
      </td>
      <td className="px-4 py-3">
        <TwelveMonths row={row} state={ctx.activityState} monthLabels={ctx.monthLabels} />
      </td>
      <td className="px-3 py-3" onClick={stop}>
        <div className="flex items-center justify-end gap-1">
          {canVoucher && <VoucherButton direction={row.direction} name={c.name} onClick={() => ctx.onVoucher(row)} />}
          <RowMenu contact={c} mayMutate={ctx.mayMutate} onEdit={ctx.onEdit} onDelete={ctx.onDelete} />
        </div>
      </td>
    </tr>
  );
});

/**
 * One file as a card, for a phone and a tablet. The name is a link stretched over the whole card, so any tap
 * opens the file; the buttons sit above it and keep their own taps (44px on a phone).
 */
export const DirectoryCard = memo(function DirectoryCard({ row, ctx }: { row: DirectoryRow; ctx: RowContext }) {
  const c = row.contact;
  const detail = contactDetail(c);
  const canVoucher = canVoucherOf(row, ctx);
  const hasPhone = Boolean(c.phone?.trim());

  return (
    <Card className="relative flex h-full flex-col gap-3.5 p-4 transition-colors hover:border-ink-mute/40">
      <div className="flex items-start gap-3">
        <PartyAvatar name={c.name} role={row.role} size="md" inactive={!c.is_active} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${c.id}`}
            className={cn(
              'block rounded-sm text-[15px] font-semibold leading-snug text-foreground after:absolute after:inset-0 after:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              !c.is_active && 'text-ink-mute',
            )}
          >
            {c.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <RoleChip row={row} />
            {!c.is_active && <InactiveChip />}
            {ctx.hintIds.has(c.id) && <RentHint />}
          </div>
          {(c.code || detail) && (
            <p className="mt-1.5 truncate text-[12px] text-ink-mute">
              {c.code && <span dir="ltr" className="tabular-nums">{c.code}</span>}
              {c.code && detail && ' · '}
              {detail}
            </p>
          )}
        </div>
        <RowMenu contact={c} mayMutate={ctx.mayMutate} onEdit={ctx.onEdit} onDelete={ctx.onDelete} className="relative z-10 -me-2 -mt-1.5" />
      </div>

      {ctx.activityState === 'ready' && !row.hasActivity ? (
        <p className="border-t border-border pt-3.5 text-[13px] text-ink-mute">لا حركات في آخر 12 شهراً</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 border-t border-border pt-3.5">
          <div className="min-w-0">
            <dt className="mb-1.5 text-[11.5px] text-ink-mute">آخر حركة</dt>
            <dd>
              <LastMovement row={row} state={ctx.activityState} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1.5 text-[11.5px] text-ink-mute">آخر 12 شهراً</dt>
            <dd>
              <TwelveMonths row={row} state={ctx.activityState} monthLabels={ctx.monthLabels} />
            </dd>
          </div>
        </dl>
      )}

      {(canVoucher || hasPhone) && (
        <div className="relative z-10 mt-auto flex items-center gap-2 border-t border-border pt-3.5">
          {canVoucher && <VoucherButton direction={row.direction} name={c.name} onClick={() => ctx.onVoucher(row)} className="flex-1 sm:h-10" />}
          {hasPhone && (
            <>
              <CallLink phone={c.phone} name={c.name} className="sm:h-10 sm:w-10" />
              <WhatsAppLink contact={c} className="sm:h-10 sm:w-10" />
            </>
          )}
        </div>
      )}
    </Card>
  );
});
