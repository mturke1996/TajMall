'use client';

import Link from 'next/link';
import { UserCircle } from 'lucide-react';
import { useCurrentProfile } from '@/lib/supabase/use-profile';
import { cn } from '@/lib/utils';

export function SidebarProfile({ collapsed = false }: { collapsed?: boolean }) {
  const { user, profile } = useCurrentProfile();

  const name = profile?.full_name_ar ?? profile?.full_name ?? user?.email?.split('@')[0] ?? 'مستخدم';
  const initial = name[0] || '?';

  return (
    <Link
      href="/profile"
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition-colors hover:bg-secondary',
        collapsed && 'justify-center border-0 bg-transparent'
      )}
    >
      <div className="grid h-8 w-8 place-items-center rounded-full bg-sage-100 font-bold text-sage-700">
        {initial}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{name}</p>
          <p className="truncate text-[11px] text-ink-mute">الملف الشخصي</p>
        </div>
      )}
      {!collapsed && <UserCircle className="h-4 w-4 text-ink-mute" />}
    </Link>
  );
}
