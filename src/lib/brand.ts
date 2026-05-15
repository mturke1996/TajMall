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
  /** Absolute web path to circular/wordmark logo (place file under /public). */
  logoSrc: string;
  /** Print-safe palette — shared by react-pdf templates */
  pdfPalette: {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    accent: string;
    accentLight: string;
    logoGreen: string;
    logoGreenSoft: string;
    text: string;
    muted: string;
    border: string;
    rowAlt: string;
    headerBg: string;
    mutedBg: string;
    white: string;
    paleGold: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
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
  /** شعار دائري من `/public` — يُستخدم في الواجهة، PDF، واختصار الشاشة الرئيسية (PWA). */
  logoSrc: '/TajMall-Icon.jpg',
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
    /** فحمي من إطار الشعار — بديل عن الأخضر */
    primary: '#171717',
    primaryDark: '#0a0a0a',
    primaryLight: '#404040',
    /** المثلث الأحمر في الشعار */
    accent: '#d32f2f',
    accentLight: '#ffcdd2',
    /** الحلقة الخضراء في الشعار */
    logoGreen: '#2f6f44',
    logoGreenSoft: '#ecf6ef',
    text: '#141414',
    muted: '#5c5f66',
    border: '#e8e6e1',
    rowAlt: '#f8f7f5',
    headerBg: '#171717',
    mutedBg: '#f3f2ef',
    white: '#ffffff',
    paleGold: '#fffaf6',
    success: '#15803d',
    warning: '#b45309',
    danger: '#b91c1c',
    info: '#1d4ed8',
  },
};

/** Build a single contact strip for the footer of PDF reports. */
export function buildPdfFooterLine(brand: Brand = BRAND): string {
  return [brand.contact.address, brand.contact.website, brand.contact.phone]
    .filter(Boolean)
    .join(' · ');
}
