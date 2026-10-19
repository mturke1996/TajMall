import { User } from 'lucide-react';
import { TILE } from '@/components/dashboard/dashboard-ui';
import { NEUTRAL_TILE, ROLE_ACCENT, type PartyAccent } from '@/components/people/people-theme';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { partyInitials } from '@/lib/people/party-initials';
import { cn } from '@/lib/utils';

const SIZE = {
  sm: 'h-9 w-9 rounded-lg text-[13px]',
  md: 'h-11 w-11 rounded-xl text-[15px]',
  lg: 'h-14 w-14 rounded-2xl text-[18px] sm:h-16 sm:w-16 sm:text-[21px]',
} as const;

/**
 * The tile with a party's initials, tinted by what the party is. Decorative: the name always stands next to
 * it, so it is hidden from screen readers.
 */
export function PartyAvatar({
  name,
  role,
  accent,
  size = 'md',
  inactive,
  className,
}: {
  name: string;
  /** tints the tile by role unless `accent` says otherwise */
  role?: ContactBusinessRole;
  accent?: PartyAccent;
  size?: keyof typeof SIZE;
  /** an archived file reads quieter */
  inactive?: boolean;
  className?: string;
}) {
  const tone = accent ?? (role ? ROLE_ACCENT[role] : 'neutral');
  const letters = partyInitials(name);
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 select-none place-items-center font-bold leading-none',
        SIZE[size],
        tone === 'neutral' ? NEUTRAL_TILE : TILE[tone],
        inactive && 'opacity-60',
        className,
      )}
    >
      {letters ? <span dir="auto">{letters}</span> : <User className="h-[45%] w-[45%]" />}
    </span>
  );
}
