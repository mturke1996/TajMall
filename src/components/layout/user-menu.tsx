'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, UserCircle } from 'lucide-react';
import { useSupabase } from '@/lib/supabase/use-supabase';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function UserMenu() {
  const supabase = useSupabase();
  const router = useRouter();
  const [signOutLoading, setSignOutLoading] = useState(false);

  async function handleSignOut() {
    setSignOutLoading(true);
    const { error } = await supabase.auth.signOut();
    setSignOutLoading(false);
    if (error) {
      toast.error('فشل تسجيل الخروج');
      return;
    }
    router.push('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="rounded-full">
          <UserCircle className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            الملف الشخصي
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} disabled={signOutLoading} className="text-pastel-redInk">
          <LogOut className="h-4 w-4" />
          {signOutLoading ? 'جارٍ...' : 'تسجيل الخروج'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
