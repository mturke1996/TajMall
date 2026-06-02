'use client';

import { Plus } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useTxDialog, type TxKind } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import type { PermissionKey } from '@/lib/constants';

/**
 * Opens the global "new transaction" dialog with a pre-selected kind.
 * Use this anywhere a "+ New" button lives.
 */
export function NewTransactionButton({
  kind = 'REVENUE',
  label = 'معاملة جديدة',
  variant = 'default',
  size = 'sm',
  className,
  hideLabelOnMobile = false,
}: {
  kind?: TxKind;
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  hideLabelOnMobile?: boolean;
}) {
  const open = useTxDialog((s) => s.open);
  const { can, loading } = usePermission();
  const perm: PermissionKey = kind === 'REVENUE' ? 'revenue.create' : 'expense.create';

  if (loading || !can(perm)) return null;

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => open(kind)}
      className={`gap-1.5 ${className ?? ''}`}
    >
      <Plus className="stroke-[1.6]" />
      <span className={hideLabelOnMobile ? 'hidden sm:inline' : ''}>{label}</span>
    </Button>
  );
}
