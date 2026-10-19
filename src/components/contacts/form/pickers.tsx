'use client';

import { useId } from 'react';
import { Briefcase, Building2, Check, Landmark, User } from 'lucide-react';
import { IconTile } from '@/components/dashboard/dashboard-ui';
import { ROLE_ACCENT, type PartyAccent } from '@/components/people/people-theme';
import { ChipRadios, type ChipOption } from '@/components/contacts/form/fields';
import { CONTACT_ROLES, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import {
  DEFAULT_ROLE,
  KIND_CHOICES,
  KIND_HINT,
  KIND_LABEL,
  ROLE_CHOICE_LABEL,
  ROLES_BY_KIND,
  type FormKind,
} from '@/lib/contacts/form-rules';
import { cn } from '@/lib/utils';

const KIND_ICON = {
  VENDOR: Landmark,
  CUSTOMER: User,
  EMPLOYEE: Briefcase,
  TENANT: Building2,
  OTHER: User,
} as const;

/** The colour of a kind is the colour of its usual role, so the avatar a file gets afterwards matches the tile it was chosen from. */
const kindAccent = (kind: FormKind): Exclude<PartyAccent, 'neutral'> => {
  const accent = ROLE_ACCENT[DEFAULT_ROLE[kind]];
  return accent === 'neutral' ? 'blue' : accent;
};

/**
 * What the file is, chosen first: four large tiles. They are radio buttons underneath (arrow keys, announced as
 * a group). `locked` kinds cannot be chosen: an existing tenant or employee keeps its kind.
 */
export function KindPicker({
  value,
  onChange,
  canChoose,
}: {
  value: FormKind;
  onChange: (kind: FormKind) => void;
  /** whether a kind may be chosen; the others are drawn dimmed */
  canChoose: (kind: FormKind) => boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label="نوع الجهة" className="grid grid-cols-4 gap-2 sm:gap-3">
      {KIND_CHOICES.map((kind) => {
        const Icon = KIND_ICON[kind];
        const allowed = canChoose(kind);
        return (
          <label
            key={kind}
            title={allowed ? undefined : 'لا يمكن تحويل ملف موجود إلى هذا النوع'}
            className={cn(
              'group relative flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-1.5 py-3 text-center sm:gap-2 sm:px-3 sm:py-3.5',
              'transition-colors has-checked:border-foreground has-checked:bg-canvas-sunken',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              allowed ? 'cursor-pointer hover:bg-canvas-sunken' : 'cursor-not-allowed opacity-45',
            )}
          >
            <input
              type="radio"
              name={name}
              value={kind}
              checked={value === kind}
              disabled={!allowed}
              onChange={() => onChange(kind)}
              className="sr-only"
            />
            <IconTile icon={Icon} accent={kindAccent(kind)} className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="text-[13.5px] font-semibold leading-tight text-foreground sm:text-[14px]">{KIND_LABEL[kind]}</span>
            <span className="hidden text-[12px] leading-snug text-ink-mute sm:block">{KIND_HINT[kind]}</span>
            <span
              aria-hidden
              className="absolute end-2 top-2 hidden h-4 w-4 place-items-center rounded-full bg-foreground text-background group-has-checked:grid"
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** A kind that cannot be changed (a tenant or an employee being edited), shown as the one fact it is. */
export function FixedKind({ kind, note }: { kind: FormKind; note: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-canvas-sunken/60 px-3.5 py-3">
      <IconTile icon={Icon} accent={kindAccent(kind)} className="h-9 w-9" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-foreground">{KIND_LABEL[kind]}</p>
        <p className="text-[12.5px] leading-snug text-ink-mute">{note}</p>
      </div>
    </div>
  );
}

/** The roles of a kind as coloured chips: kinds of supply for a vendor, «عميل» or «مؤجر للمول» for a customer. */
export function RolePicker({
  kind,
  value,
  onChange,
}: {
  kind: FormKind;
  value: ContactBusinessRole;
  onChange: (role: ContactBusinessRole) => void;
}) {
  const name = useId();
  const options: ChipOption<ContactBusinessRole>[] = ROLES_BY_KIND[kind].map((role) => {
    const accent = ROLE_ACCENT[role];
    return {
      value: role,
      label: ROLE_CHOICE_LABEL[role] ?? CONTACT_ROLES[role].badge,
      icon: CONTACT_ROLES[role].icon,
      accent: accent === 'neutral' ? undefined : accent,
    };
  });
  return <ChipRadios name={name} label={kind === 'VENDOR' ? 'نوع التوريد' : 'الصفة'} value={value} onChange={onChange} options={options} />;
}
