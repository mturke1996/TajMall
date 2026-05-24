'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useCurrentProfile } from '@/lib/supabase/use-profile';
import { cn, initials } from '@/lib/utils';

export function SidebarProfile({ collapsed = false }: { collapsed?: boolean }) {
  const { user, profile } = useCurrentProfile();

  const name =
    profile?.full_name_ar ??
    profile?.full_name ??
    user?.email?.split('@')[0] ??
    'مستخدم';
  const role = profile?.role ?? 'مستخدم';
  const abbr = initials(name) || name[0]?.toUpperCase() || '?';

  // Pick a consistent color from the name's first char code
  const hue = ((name.charCodeAt(0) ?? 0) * 37) % 360;
  const avatarStyle = {
    background: `hsl(${hue} 55% 90%)`,
    color: `hsl(${hue} 55% 35%)`,
  };

  return (
    <Link
      href="/profile"
      className={cn(
        'group flex items-center gap-3 rounded-lg p-2 transition-all duration-150',
        'hover:bg-canvas-sunken',
        collapsed && 'justify-center',
      )}
    >
      {/* Avatar */}
      <div
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold select-none"
        style={avatarStyle}
      >
        {abbr}
      </div>

      {/* Name + role */}
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-none mb-0.5">{name}</p>
          <p className="truncate text-[11px] text-muted-foreground capitalize">{role}</p>
        </div>
      )}

      {!collapsed && (
        <Settings className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0" />
      )}
    </Link>
  );
}
