export type ContactPageLoader<T> = (offset: number, pageSize: number) => Promise<T[]>;

/** Money that really moved: drafts and voided entries are not in any total, reconciled ones are. */
export const COUNTED_TX_STATUSES = ['POSTED', 'RECONCILED'] as const;

export function isCountedTransaction(transaction: { status?: string | null }): boolean {
  return COUNTED_TX_STATUSES.some((status) => status === transaction.status);
}

/** Every transaction that counts in the books (POSTED and RECONCILED), in the order given. */
export function getCountedContactTransactions<T extends { status?: string | null }>(
  transactions: readonly T[],
): T[] {
  return transactions.filter(isCountedTransaction);
}

/** Load every page in a stable, bounded sequence instead of silently capping profile totals. */
export async function fetchAllContactPages<T>(
  loadPage: ContactPageLoader<T>,
  pageSize = 1_000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize must be a positive integer');
  }

  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await loadPage(offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
