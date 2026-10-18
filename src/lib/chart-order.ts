/**
 * Recharts 3 sorts tooltip rows by name and legend items by value; the dashboards list series in
 * the order they are drawn (revenue before expenses, largest expense first), as Recharts 2 did.
 * Pass to <Tooltip itemSorter> — every row gets the same key, so the stable sort keeps the order.
 * For <Legend> use itemSorter={null}.
 */
export const keepSeriesOrder = () => 0;
