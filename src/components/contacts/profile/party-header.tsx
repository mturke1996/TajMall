'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeftRight, Ellipsis, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProfileHeader } from '@/components/people';
import { RoleBadge } from '@/components/people/role-badge';
import { ContactWhatsAppButton } from '@/components/contacts/contact-phone-actions';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { canCreateContactTransaction, formatContactSaveError } from '@/lib/contacts/form-utils';
import { CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { contactBackHref } from '@/lib/mall/routes';
import { useUpdateContact } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { useTxDialog } from '@/stores/transaction-dialog';
import {
  backLabel,
  buildStatement,
  DIRECTION_WORDS,
  KIND_MOVE_WORDS,
  moveDescription,
  moveKindPatch,
  moveTarget,
  profileLook,
  txKindOfDirection,
} from '@/lib/people/party-profile';
import type { Direction } from '@/lib/people/party-stats';
import { cn, todayISODate } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';

/**
 * The top of a vendor, customer or landlord page: who, status, how to reach them, and the actions — the
 * voucher for the side money moves on, WhatsApp, the account statement, edit, and a menu to file the contact
 * under the other list. Who sees what follows the same permissions as before.
 */
export function PartyHeader({
  contact,
  role,
  direction,
  landlord,
  transactions,
  statementReady,
  onEdit,
  extraActions,
}: {
  contact: ContactRow;
  role: ContactBusinessRole;
  direction: Direction;
  landlord: boolean;
  transactions: TransactionWithRelations[];
  /** the transactions loaded; the statement waits for them */
  statementReady: boolean;
  onEdit?: () => void;
  /** a link that belongs to this kind of file only (an employee's payroll file) */
  extraActions?: ReactNode;
}) {
  const { can, canWrite } = usePermission();
  const openTx = useTxDialog((s) => s.open);
  const update = useUpdateContact();
  const [moving, setMoving] = useState(false);

  const txKind = txKindOfDirection(direction);
  const words = DIRECTION_WORDS[direction];
  const mayCreate = canCreateContactTransaction(contact.is_active, can(txKind === 'EXPENSE' ? 'expense.create' : 'revenue.create'));
  const look = useMemo(() => profileLook(contact), [contact]);
  const target = canWrite ? moveTarget(contact.kind) : null;
  const statement = useMemo(() => buildStatement(transactions), [transactions]);
  const fileName = `كشف-حساب-${contact.name}-${todayISODate()}`;

  const newVoucher = () => openTx({ kind: txKind, contactId: contact.id, contactKind: contact.kind });

  async function renderStatement() {
    const { PartyStatementPDF } = await import('@/features/pdf/PartyStatementPDF');
    return (
      <PartyStatementPDF
        name={contact.name}
        code={contact.code}
        phone={contact.phone}
        roleLabel={look.role ? CONTACT_ROLES[look.role].badge : (look.kindLabel ?? '')}
        issuedOn={todayISODate()}
        statement={statement}
      />
    );
  }

  async function move() {
    if (!target) return;
    try {
      await update.mutateAsync({ id: contact.id, ...moveKindPatch(contact, target) });
      toast.success(KIND_MOVE_WORDS[target].done);
    } catch (err) {
      console.error('[contacts] move failed', err);
      toast.error(formatContactSaveError(err));
      throw err; // the dialog stays open for another try
    }
  }

  const primary = mayCreate ? (
    <Button type="button" className="min-h-11 flex-[2_1_100%] gap-1.5 sm:min-h-9 sm:flex-none" onClick={newVoucher}>
      <Plus aria-hidden />
      {words.voucher}
    </Button>
  ) : null;

  const actions = (
    <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap">
      {primary}
      {extraActions}
      <ContactWhatsAppButton name={contact.name} phone={contact.phone} kind={contact.kind} iconOnPhone className="shrink-0" />
      <TajMallPdfToolbar
        fileName={fileName}
        shareTitle={`كشف حساب ${contact.name}`}
        cacheKey={`${transactions.length}:${statement.net}`}
        render={renderStatement}
        disabled={!statementReady || statement.rows.length === 0}
        showDownload={false}
        openLabel="كشف الحساب"
        className="flex-1 flex-nowrap sm:flex-none [&>button]:flex-1"
      />
      {onEdit && (
        <Button type="button" variant="outline" className="min-h-11 flex-1 gap-1.5 sm:min-h-9 sm:flex-none" onClick={onEdit}>
          <Pencil aria-hidden />
          تعديل
        </Button>
      )}
      {target && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" aria-label="المزيد">
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem className="min-h-11 sm:min-h-0" onSelect={() => setMoving(true)}>
              <ArrowLeftRight aria-hidden />
              {KIND_MOVE_WORDS[target].menu}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <>
      <ProfileHeader
        // below xl the actions drop under the name instead of squeezing it
        className="sm:[&>div]:flex-wrap"
        name={contact.name}
        code={contact.code}
        role={role}
        inactive={!contact.is_active}
        status={contact.is_active ? { label: 'نشط', tone: 'success' } : { label: 'غير نشط', tone: 'warning' }}
        subtitle={contact.name_en ? <span dir="ltr">{contact.name_en}</span> : undefined}
        chips={
          <>
            {look.role && <RoleBadge role={look.role} />}
            {look.kindLabel && (
              <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border border-border bg-canvas-sunken px-2.5 py-0.5 text-[12px] font-medium leading-5 text-ink-soft')}>
                {look.kindLabel}
              </span>
            )}
          </>
        }
        contact={contact}
        back={{ href: contactBackHref(contact.kind, { landlord }), label: backLabel(contact.kind, landlord) }}
        actions={actions}
        stickyAction={
          primary ? (
            <Button type="button" className="min-h-11 gap-1.5" onClick={newVoucher}>
              <Plus aria-hidden />
              {words.voucher}
            </Button>
          ) : onEdit ? (
            <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={onEdit}>
              <Pencil aria-hidden />
              تعديل
            </Button>
          ) : undefined
        }
      />

      {target && (
        <ConfirmDialog
          open={moving}
          onOpenChange={setMoving}
          tone="default"
          title={KIND_MOVE_WORDS[target].title}
          description={moveDescription(target, landlord)}
          details={[{ label: 'الجهة', value: contact.name }]}
          confirmLabel="انقل الملف"
          onConfirm={move}
        />
      )}
    </>
  );
}
