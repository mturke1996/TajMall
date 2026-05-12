'use client';

import { create } from 'zustand';

/**
 * Lightweight UI store that owns the "new transaction" dialog.
 * Any button anywhere can call `useTxDialog().open()` — no prop drilling.
 */

export type TxKind = 'REVENUE' | 'EXPENSE';

type State = {
  isOpen: boolean;
  defaultKind: TxKind;
  open: (kind?: TxKind) => void;
  close: () => void;
};

export const useTxDialog = create<State>((set) => ({
  isOpen: false,
  defaultKind: 'REVENUE',
  open: (kind = 'REVENUE') => set({ isOpen: true, defaultKind: kind }),
  close: () => set({ isOpen: false }),
}));
