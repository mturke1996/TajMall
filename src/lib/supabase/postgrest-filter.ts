/**
 * Building PostgREST filters from text a person typed.
 *
 * `.or('a.ilike.%x%,b.ilike.%x%')` is one string that PostgREST parses: a comma starts another filter,
 * parentheses and double quotes group and quote, `\` escapes, `%`, `_` and `*` are wildcards. A search
 * box value spliced into it can therefore add or break conditions ("x%,id.not.is.null" would turn the
 * search into "everything"). Strip those characters from the term and build the string here, so no call
 * site composes it by hand. Column names must be fixed identifiers written in the code, never user text.
 */

/** Longest term worth sending to the database. */
const MAX_TERM_LENGTH = 100;

/**
 * The term with every character that has a meaning in a PostgREST filter value or a LIKE pattern replaced
 * by a space, whitespace collapsed and trimmed. Returns '' when nothing searchable is left.
 */
export function sanitizeSearchTerm(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[,()"\\%_*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TERM_LENGTH)
    .trim();
}

const COLUMN = /^[a-z_][a-z0-9_]*$/;

/**
 * The argument for `.or()` that matches `term` (contains, case-insensitive) in any of `columns`, or null
 * when the term is empty after cleaning (then add no filter at all).
 */
export function buildIlikeOrFilter(columns: readonly string[], term: string | null | undefined): string | null {
  const s = sanitizeSearchTerm(term);
  if (!s) return null;
  for (const c of columns) {
    if (!COLUMN.test(c)) throw new Error(`Unsafe column name in filter: ${c}`);
  }
  return columns.map((c) => `${c}.ilike.%${s}%`).join(',');
}
