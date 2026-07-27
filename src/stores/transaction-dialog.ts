'use client';

import { create } from 'zustand';
import type { ContactKind } from '@/lib/db/types';

/**
 * Lightweight UI store that owns the "new transaction" dialog.
 * Any button anywhere can call `useTxDialog().open()` — no prop drilling.
 */

export type TxKind = 'REVENUE' | 'EXPENSE';

export type TxDialogPrefill = {
  kind?: TxKind;
  contactId?: string;
  contactKind?: ContactKind | 'ALL';
};

type State = {
  isOpen: boolean;
  defaultKind: TxKind;
  prefillContactId: string | null;
  prefillContactKind: ContactKind | 'ALL' | null;
  open: (kindOrPrefill?: TxKind | TxDialogPrefill) => void;
  close: () => void;
};

function resolveOpen(arg?: TxKind | TxDialogPrefill): Omit<State, 'open' | 'close'> {
  if (!arg || typeof arg === 'string') {
    return {
      isOpen: true,
      defaultKind: arg ?? 'REVENUE',
      prefillContactId: null,
      prefillContactKind: null,
    };
  }
  return {
    isOpen: true,
    defaultKind: arg.kind ?? 'REVENUE',
    prefillContactId: arg.contactId ?? null,
    prefillContactKind: arg.contactKind ?? null,
  };
}

export const useTxDialog = create<State>((set) => ({
  isOpen: false,
  defaultKind: 'REVENUE',
  prefillContactId: null,
  prefillContactKind: null,
  open: (kindOrPrefill) => set(resolveOpen(kindOrPrefill)),
  close: () =>
    set({
      isOpen: false,
      prefillContactId: null,
      prefillContactKind: null,
    }),
}));
