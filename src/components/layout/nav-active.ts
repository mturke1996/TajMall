/**
 * Consistent active-state matching for sidebar / mobile nav (RTL app).
 * Avoids false positives (e.g. every route matching "/" if we ever add it).
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
