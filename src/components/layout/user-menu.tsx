'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Loader2, LogOut, User as UserIcon, Settings, Shield } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUser } from '@/lib/supabase/use-user';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand';
import { initials } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Authenticated user dropdown.
 * - Avatar shows real initials when logged in, brand monogram otherwise.
 * - Menu items are quick links + a real sign-out via Supabase.
 */
export function UserMenu() {
  const router = useRouter();
  const { user } = useUser();
  const [signingOut, setSigningOut] = useState(false);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'الحساب';

  const avatarText = user ? initials(displayName) : BRAND.monogram;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      toast.success('تم تسجيل الخروج');
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('تعذّر تسجيل الخروج');
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="الحساب">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{avatarText}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {user ? (
          <DropdownMenuLabel className="normal-case tracking-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-foreground">
                {displayName}
              </span>
              <span className="truncate text-[11px] font-normal text-ink-mute">
                {user.email}
              </span>
            </div>
          </DropdownMenuLabel>
        ) : (
          <DropdownMenuLabel>الحساب</DropdownMenuLabel>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserIcon />
            الملف الشخصي
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/roles">
            <Shield />
            الفريق والصلاحيات
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            الإعدادات
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            signOut();
          }}
          className="text-pastel-redInk focus:text-pastel-redInk"
        >
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
