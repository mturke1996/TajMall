'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useUser } from '@/lib/supabase/use-user';
import { BRAND } from '@/lib/brand';
import { initials, cn } from '@/lib/utils';

/**
 * Compact profile pill at the bottom of the sidebar.
 * Shows the live Supabase user; falls back to a neutral placeholder
 * if not signed in (matters only on /login while collapsed).
 */
export function SidebarProfile({ collapsed = false }: { collapsed?: boolean }) {
  const { user, loading } = useUser();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'ضيف';

  const secondary = user?.email ?? `${BRAND.region}`;
  const avatarText = user ? initials(displayName) : BRAND.monogram;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-2',
        collapsed && 'justify-center border-0 bg-transparent p-1',
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback>{avatarText}</AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <>
              <span className="shimmer h-3 w-20 rounded" />
              <span className="shimmer mt-1.5 h-2.5 w-28 rounded" />
            </>
          ) : (
            <>
              <span className="truncate text-[13px] font-semibold">
                {displayName}
              </span>
              <span className="truncate text-[11px] text-ink-mute">{secondary}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
