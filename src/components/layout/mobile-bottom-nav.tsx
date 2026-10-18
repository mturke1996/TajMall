"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTxDialog } from "@/stores/transaction-dialog";
import { usePermission } from "@/lib/supabase/use-permission";

const leftNavItems = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/revenues", label: "إيرادات", icon: ArrowDownToLine },
];

const rightNavItems = [
  { href: "/expenses", label: "مصروفات", icon: ArrowUpFromLine },
  { href: "/activity", label: "النشاط", icon: Activity },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const openTx = useTxDialog((s) => s.open);
  const { can } = usePermission();
  const canCreateRevenue = can("revenue.create");
  const canCreateExpense = can("expense.create");
  const canCreate = canCreateRevenue || canCreateExpense;

  return (
    <nav
      className="fixed bottom-0 inset-e-0 inset-s-0 z-50 border-t border-border bg-canvas md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16 items-stretch justify-around">
        {leftNavItems.map((item) => (
          <TabLink key={item.href} item={item} pathname={pathname} />
        ))}

        <div className="flex w-[68px] shrink-0 items-center justify-center -mt-2">
          <motion.button
            whileTap={canCreate ? { scale: 0.94 } : undefined}
            type="button"
            onClick={
              canCreate
                ? () => openTx(canCreateRevenue ? "REVENUE" : "EXPENSE")
                : undefined
            }
            disabled={!canCreate}
            className={cn(
              "grid h-[52px] w-[52px] place-items-center rounded-full ring-4 ring-canvas shadow-lg transition-all",
              canCreate ? "bg-foreground text-background" : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
            )}
            aria-label="إضافة معاملة"
          >
            <Plus className="h-6 w-6" />
          </motion.button>
        </div>

        {rightNavItems.map((item) => (
          <TabLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  item,
  pathname,
}: {
  item: { href: string; label: string; icon: LucideIcon };
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      prefetch
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors duration-100",
        isActive ? "text-foreground" : "text-ink-mute",
      )}
    >
      <motion.span
        whileTap={{ scale: 0.92 }}
        className={cn("rounded-lg p-1", isActive && "bg-muted")}
      >
        <Icon className="h-[18px] w-[18px]" />
      </motion.span>
      <span className="max-w-[64px] truncate text-xs leading-tight">{item.label}</span>
      <span
        className={cn(
          "mt-0.5 h-1 w-1 rounded-full transition-opacity",
          isActive ? "bg-foreground opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
    </Link>
  );
}
