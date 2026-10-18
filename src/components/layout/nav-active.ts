/**
 * Consistent active-state matching for sidebar / mobile nav (RTL app).
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  // مركز التقارير يبقى مفعّلاً داخل أي تقرير، عدا قيد الفترة الذي له بند مستقل في القائمة
  if (href === '/reports') {
    return pathname === '/reports' || (pathname.startsWith('/reports/') && !pathname.startsWith('/reports/journal-month'));
  }
  if (href === '/documents') return pathname === '/documents';

  const [path, queryString] = href.split('?');

  if (pathname !== path && !pathname.startsWith(`${path}/`)) {
    return false;
  }

  if (!queryString) {
    if (path === '/mall') {
      return (
        pathname === '/mall' &&
        (typeof window === 'undefined' ||
          !new URLSearchParams(window.location.search).get('tab') ||
          new URLSearchParams(window.location.search).get('tab') === 'overview')
      );
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  if (typeof window === 'undefined') {
    return pathname === path;
  }

  const current = new URLSearchParams(window.location.search);
  const target = new URLSearchParams(queryString);

  for (const [key, value] of target.entries()) {
    if (current.get(key) !== value) return false;
  }
  // "/mall?tab=people" is the whole directory; with a segment selected the segment's own item is active.
  const segment = current.get('segment');
  if (!target.has('segment') && segment && segment !== 'all') return false;
  return true;
}
