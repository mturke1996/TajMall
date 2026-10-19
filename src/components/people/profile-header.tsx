'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Mail, MapPin, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PartyAvatar } from '@/components/people/party-avatar';
import { RoleBadge } from '@/components/people/role-badge';
import { CHIP, MARK, type ChipTone, type PartyAccent } from '@/components/people/people-theme';
import type { ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { digitsOnly } from '@/lib/arabic-search';
import { cn } from '@/lib/utils';

export type ProfileStatus = { label: string; tone: ChipTone };

export type ProfileContact = {
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
};

const clean = (v: string | null | undefined) => (v ?? '').trim();
// «٠٩١٢٣٤٥٦٧٨» dials like «0912345678»
const telHref = (v: string) => `tel:${v.trim().startsWith('+') ? '+' : ''}${digitsOnly(v)}`;

/** True once the element has scrolled out above the top bar (64px). Phones only use it. */
function useScrolledPast(ref: React.RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.bottom < 80), {
      rootMargin: '-64px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/**
 * The top of a person's page: avatar tile, name (the page's only h1), code, status, role chips, contact lines
 * and the actions. On a phone a slim bar with the name and one action takes over once the header scrolls out
 * of view (`stickyAction`); render the header directly inside the page's padded column (px-4) so it can stick.
 */
export function ProfileHeader({
  name,
  code,
  role,
  avatarAccent,
  inactive,
  subtitle,
  status,
  roles,
  chips,
  contact,
  back,
  actions,
  stickyAction,
  className,
}: {
  name: string;
  code?: string | null;
  /** tints the avatar */
  role?: ContactBusinessRole;
  avatarAccent?: PartyAccent;
  /** an archived file reads quieter */
  inactive?: boolean;
  /** job title, site, one short line */
  subtitle?: ReactNode;
  status?: ProfileStatus;
  /** role chips */
  roles?: ContactBusinessRole[];
  /** any other chips after the role chips */
  chips?: ReactNode;
  contact?: ProfileContact;
  back?: { href: string; label: string };
  /** buttons; the caller decides who sees them */
  actions?: ReactNode;
  /** the one action kept in the slim phone bar */
  stickyAction?: ReactNode;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const past = useScrolledPast(cardRef);

  const lines = [
    clean(contact?.phone) && { key: 'phone', icon: Phone, text: clean(contact?.phone), href: telHref(clean(contact?.phone)), ltr: true },
    clean(contact?.phone2) && { key: 'phone2', icon: Phone, text: clean(contact?.phone2), href: telHref(clean(contact?.phone2)), ltr: true },
    clean(contact?.email) && { key: 'email', icon: Mail, text: clean(contact?.email), href: `mailto:${clean(contact?.email)}`, ltr: true },
    clean(contact?.address) && { key: 'address', icon: MapPin, text: clean(contact?.address), href: undefined, ltr: false },
  ].filter(Boolean) as { key: string; icon: typeof Phone; text: string; href?: string; ltr: boolean }[];

  return (
    <>
      <div className="sticky top-16 z-20 h-0 sm:hidden">
        <div
          className={cn('absolute -inset-x-4 top-0 min-h-12 items-center gap-3 border-b border-border bg-canvas px-4 py-1.5', past ? 'flex' : 'hidden')}
          aria-hidden={!past}
        >
          <PartyAvatar name={name} role={role} accent={avatarAccent} size="sm" inactive={inactive} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{name}</span>
          {stickyAction && <div className="shrink-0 *:min-h-11">{stickyAction}</div>}
        </div>
      </div>

      <Card ref={cardRef} className={cn('min-w-0 p-4 sm:p-6', className)}>
        {back && (
          <Link
            href={back.href}
            className="-mt-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-md pe-2 text-[13px] text-ink-mute hover:text-foreground sm:min-h-9"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
            {back.label}
          </Link>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-3.5 sm:gap-5">
            <PartyAvatar name={name} role={role} accent={avatarAccent} size="lg" inactive={inactive} />
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-[21px] font-bold leading-snug sm:text-[26px]">{name}</h1>
              {(code || status || subtitle) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-mute">
                  {code && (
                    <span className="font-mono tabular-nums" dir="ltr">
                      {code}
                    </span>
                  )}
                  {status && (
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium leading-5', CHIP[status.tone])}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', MARK[status.tone])} aria-hidden />
                      {status.label}
                    </span>
                  )}
                  {subtitle && <span className="min-w-0 break-words">{subtitle}</span>}
                </div>
              )}
              {((roles && roles.length > 0) || chips) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {roles?.map((r) => <RoleBadge key={r} role={r} />)}
                  {chips}
                </div>
              )}
            </div>
          </div>

          {actions && <div className="flex flex-wrap items-center gap-2 *:grow *:min-h-11 sm:justify-end sm:*:grow-0 sm:*:min-h-9">{actions}</div>}
        </div>

        {lines.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-0.5 border-t border-border pt-3 text-[13px] text-ink-soft">
            {lines.map(({ key, icon: Icon, text, href, ltr }) => (
              <li key={key} className="min-w-0">
                {href ? (
                  <a href={href} className="inline-flex min-h-11 items-center gap-2 rounded-md hover:text-foreground sm:min-h-8">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-mute" aria-hidden />
                    <span dir={ltr ? 'ltr' : undefined} className="tabular-nums">
                      {text}
                    </span>
                  </a>
                ) : (
                  <span className="inline-flex min-h-8 items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-mute" aria-hidden />
                    <span className="break-words">{text}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
