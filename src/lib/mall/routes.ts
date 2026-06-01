export const MALL_HREF = '/mall';

export type MallTab =
  | 'overview'
  | 'units'
  | 'tenants'
  | 'contracts'
  | 'charges'
  | 'people';

/** تبويب فرعي داخل «الجهات والدليل» */
export type PeopleSegment = 'all' | 'TENANT' | 'EMPLOYEE' | 'VENDOR' | 'CUSTOMER';

export const MALL_TABS: MallTab[] = [
  'overview',
  'units',
  'tenants',
  'contracts',
  'charges',
  'people',
];

export const PEOPLE_SEGMENTS: PeopleSegment[] = [
  'all',
  'TENANT',
  'EMPLOYEE',
  'VENDOR',
  'CUSTOMER',
];

export function isMallTab(value: string | null): value is MallTab {
  return MALL_TABS.includes(value as MallTab);
}

export function isPeopleSegment(value: string | null): value is PeopleSegment {
  return PEOPLE_SEGMENTS.includes(value as PeopleSegment);
}

export function mallTabHref(
  tab: MallTab,
  params?: Record<string, string>,
) {
  const search = new URLSearchParams({ tab, ...params });
  return `${MALL_HREF}?${search.toString()}`;
}

export function peopleSegmentHref(segment: PeopleSegment, extra?: Record<string, string>) {
  return mallTabHref('people', { segment, ...extra });
}

/** مسار قديم → تبويب موحّد */
export const LEGACY_MALL_REDIRECTS: Record<string, MallTab> = {
  '/mall/units': 'units',
  '/mall/contracts': 'contracts',
  '/mall/charges': 'charges',
  '/tenants': 'tenants',
  '/contacts': 'people',
};

export const LEGACY_PEOPLE_SEGMENT: Record<string, PeopleSegment> = {
  '/employees': 'EMPLOYEE',
  '/vendors': 'VENDOR',
};

export function contactBackHref(kind: string) {
  switch (kind) {
    case 'TENANT':
      return mallTabHref('tenants');
    case 'EMPLOYEE':
      return peopleSegmentHref('EMPLOYEE');
    case 'VENDOR':
      return peopleSegmentHref('VENDOR');
    case 'CUSTOMER':
      return peopleSegmentHref('CUSTOMER');
    default:
      return peopleSegmentHref('all');
  }
}
