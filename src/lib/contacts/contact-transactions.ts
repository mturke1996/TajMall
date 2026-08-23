export type ContactPageLoader<T> = (offset: number, pageSize: number) => Promise<T[]>;

export function getPostedContactTransactions<T extends { status: string }>(
  transactions: readonly T[],
): T[] {
  return transactions.filter((transaction) => transaction.status === 'POSTED');
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
