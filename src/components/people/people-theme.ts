import type { Accent } from '@/components/dashboard/dashboard-ui';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';

/**
 * Colours shared by the people components. Everything is a token class, so dark mode follows.
 * Accents (the vivid colours) paint icon tiles and chart marks; text uses the `*-ink` of a status family.
 */

export type PartyAccent = Accent | 'neutral';

/** The status family a chip uses; `neutral` is the plain grey chip. */
export type ChipTone = 'success' | 'danger' | 'warning' | 'info' | 'plum' | 'neutral';

export const CHIP: Record<ChipTone, string> = {
  success: 'border-success-line bg-success-soft text-success-ink',
  danger: 'border-danger-line bg-danger-soft text-danger-ink',
  warning: 'border-warning-line bg-warning-soft text-warning-ink',
  info: 'border-info-line bg-info-soft text-info-ink',
  plum: 'border-plum-line bg-plum-soft text-plum-ink',
  neutral: 'border-border bg-canvas-sunken text-ink-soft',
};

/** Text colour of a figure in a status family. */
export const INK: Record<ChipTone, string> = {
  success: 'text-success-ink',
  danger: 'text-danger-ink',
  warning: 'text-warning-ink',
  info: 'text-info-ink',
  plum: 'text-plum-ink',
  neutral: 'text-ink-mute',
};

/** A solid mark (dot, bar) in a status family. */
export const MARK: Record<ChipTone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  plum: 'bg-plum',
  neutral: 'bg-ink-mute',
};

/** There is no teal status family: teal chips read as information. */
export const ACCENT_CHIP: Record<Accent, ChipTone> = {
  green: 'success',
  red: 'danger',
  amber: 'warning',
  blue: 'info',
  violet: 'plum',
  teal: 'info',
};

/** Bar and dot fills in the vivid accents (a Tailwind class cannot be built from a string at run time). */
export const ACCENT_FILL: Record<Accent, string> = {
  green: 'bg-chart-green',
  red: 'bg-chart-red',
  amber: 'bg-chart-amber',
  blue: 'bg-chart-blue',
  violet: 'bg-chart-violet',
  teal: 'bg-chart-teal',
};

/** Avatar and icon tile of a party that has no accent of its own. */
export const NEUTRAL_TILE = 'bg-muted text-ink-soft';

/**
 * The colour a role carries everywhere: money that comes in is green, rent is violet, energy amber,
 * water blue, goods red (money out), services and staff teal.
 */
export const ROLE_ACCENT: Record<ContactBusinessRole, PartyAccent> = {
  TENANT: 'green',
  CUSTOMER: 'green',
  LANDLORD: 'violet',
  SUPPLIER_ELECTRICITY: 'amber',
  SUPPLIER_WATER: 'blue',
  SUPPLIER_GOODS: 'red',
  SERVICE_PROVIDER: 'teal',
  EMPLOYEE: 'teal',
  OTHER: 'neutral',
};
