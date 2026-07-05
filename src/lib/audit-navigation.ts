import { mallTabHref } from '@/lib/mall/routes';
import type { AuditLogRow } from '@/lib/db/audit-queries';

export type AuditLinkTarget = {
  href: string;
  label: string;
};

const ENTITY_LINK_LABELS: Record<string, string> = {
  transaction: 'فتح المعاملة',
  journal_entry: 'فتح القيد',
  disbursement_voucher: 'فتح إذن الصرف',
  tenant_charge: 'فتح المطالبة',
  cashbox: 'فتح الخزينة',
};

/** رابط لعرض السجل المصدر — لا يُعرض للحذف (السجل قد لا يكون موجوداً). */
export function getAuditEntityLink(row: AuditLogRow): AuditLinkTarget | null {
  if (!row.entity_id || row.action === 'DELETE') return null;

  const id = row.entity_id;
  const meta = row.metadata ?? {};

  switch (row.entity_type) {
    case 'transaction': {
      const kind = typeof meta.kind === 'string' ? meta.kind : null;
      if (kind === 'REVENUE') {
        return { href: `/revenues?highlight=${id}`, label: ENTITY_LINK_LABELS.transaction };
      }
      if (kind === 'EXPENSE') {
        return { href: `/expenses?highlight=${id}`, label: ENTITY_LINK_LABELS.transaction };
      }
      return { href: `/transactions?highlight=${id}`, label: ENTITY_LINK_LABELS.transaction };
    }
    case 'journal_entry':
      return { href: `/journals?highlight=${id}`, label: ENTITY_LINK_LABELS.journal_entry };
    case 'disbursement_voucher':
      return { href: `/vouchers?highlight=${id}`, label: ENTITY_LINK_LABELS.disbursement_voucher };
    case 'tenant_charge':
      return {
        href: mallTabHref('charges', { highlight: id }),
        label: ENTITY_LINK_LABELS.tenant_charge,
      };
    case 'cashbox':
      return { href: `/cashboxes/${id}`, label: ENTITY_LINK_LABELS.cashbox };
    case 'cash_transfer': {
      const toId = typeof meta.to_cashbox_id === 'string' ? meta.to_cashbox_id : id;
      return { href: `/cashboxes/${toId}`, label: 'فتح سجل التحويل' };
    }
    default:
      return null;
  }
}
