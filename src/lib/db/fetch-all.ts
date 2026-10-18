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

/** `in (…)` lists are split so a long list of ids never builds a request URL too long for the server. */
export async function fetchInChunks<T>(
  ids: string[],
  read: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 150,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await read(ids.slice(i, i + size));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}
