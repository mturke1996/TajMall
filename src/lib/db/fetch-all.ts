/**
 * PostgREST returns at most 1,000 rows per request. A list that must be complete (charges, vouchers,
 * receipts) is read page by page until a short page. `page(from, to)` builds a fresh query for the range;
 * give it a unique order (e.g. ending in `id`) so no row is repeated or skipped between pages.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
}
