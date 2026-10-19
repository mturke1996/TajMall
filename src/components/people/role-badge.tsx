import { ACCENT_CHIP, CHIP, ROLE_ACCENT } from '@/components/people/people-theme';
import { CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { cn } from '@/lib/utils';

/** What a party is to the mall, as a small chip in the colour of that role. */
export function RoleBadge({ role, label, className }: { role: ContactBusinessRole; label?: string; className?: string }) {
  const meta = CONTACT_ROLES[role];
  const accent = ROLE_ACCENT[role];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5',
        CHIP[accent === 'neutral' ? 'neutral' : ACCENT_CHIP[accent]],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label ?? meta.badge}
    </span>
  );
}
