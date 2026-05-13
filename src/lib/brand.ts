/**
 * Brand single-source-of-truth.
 *
 * The default ships pre-configured for "تاج مول" (Taj Mall) — the entity
 * behind the legacy Excel workbook. All values here are easily editable
 * later from /settings/organization once Supabase is wired.
 *
 * Public socials referenced: facebook.com/tajmall.ly (set in `socials`).
 */

export type Brand = {
  /** Short display name (UI buttons, sidebar) */
  name: string;
  /** Full legal name (PDF headers, official docs) */
  fullName: string;
  /** Optional Latin name for headers */
  nameLatin: string;
  /** One-line tagline shown below the wordmark */
  tagline: string;
  /** Single-letter mark used in the rounded square logo */
  monogram: string;
  /** Default currency code */
  currency: string;
  /** Country/region label */
  region: string;
  /** Contact lines printed on PDFs */
  contact: {
    phone: string;
    phone2: string;
    email: string;
    website: string;
    address: string;
  };
  /** Public socials surfaced on the login screen footer */
  socials: {
    facebook: string;
  };
  /** Print-safe palette used by react-pdf templates */
  pdfPalette: {
    primary: string;
    primaryDark: string;
    accent: string;
    text: string;
    muted: string;
    border: string;
    rowAlt: string;
    headerBg: string;
    success: string;
    warning: string;
    danger: string;
  };
};

export const BRAND: Brand = {
  name: 'تاج مول',
  fullName: 'تاج مول · Taj Mall',
  nameLatin: 'Taj Mall',
  tagline: 'منظومة إدارة المول التجاري — إيرادات، مصروفات، وخزائن',
  monogram: 'ت',
  currency: 'LYD',
  region: 'طرابلس · ليبيا',
  contact: {
    phone: '',
    phone2: '',
    email: '',
    website: 'facebook.com/tajmall.ly',
    address: 'طرابلس - ليبيا',
  },
  socials: {
    facebook: 'https://www.facebook.com/tajmall.ly/',
  },
  pdfPalette: {
    primary:     '#2F3D27', // deep sage
    primaryDark: '#1B241A',
    accent:      '#8B7943', // warm sand
    text:        '#15171A',
    muted:       '#6E7470',
    border:      '#ECEAE3',
    rowAlt:      '#FBFBFA',
    headerBg:    '#2F3D27',
    success:     '#2F5234',
    warning:     '#7A5C0F',
    danger:      '#8A2F2D',
  },
};

/** Build a single contact strip for the footer of PDF reports. */
export function buildPdfFooterLine(brand: Brand = BRAND): string {
  return [brand.contact.address, brand.contact.website, brand.contact.phone]
    .filter(Boolean)
    .join(' · ');
}
