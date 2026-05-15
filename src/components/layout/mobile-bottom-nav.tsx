"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTxDialog } from "@/stores/transaction-dialog";

const leftNavItems = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/revenues", label: "إيرادات", icon: ArrowDownToLine },
];

const rightNavItems = [
  { href: "/expenses", label: "مصروفات", icon: ArrowUpFromLine },
  { href: "/transactions", label: "حركة", icon: ArrowLeftRight },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const openTx = useTxDialog((s) => s.open);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-canvas md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16 items-stretch justify-around">
        {leftNavItems.map((item) => (
          <TabLink key={item.href} item={item} pathname={pathname} />
        ))}

        <div className="flex w-[68px] shrink-0 items-center justify-center -mt-2">
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={() => openTx("REVENUE")}
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-sage-700 text-white shadow-lg ring-4 ring-canvas"
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
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors duration-100",
        isActive ? "text-sage-700" : "text-ink-mute",
      )}
    >
      <motion.span
        whileTap={{ scale: 0.92 }}
        className={cn("rounded-lg p-1", isActive && "bg-sage-100")}
      >
        <Icon className="h-[18px] w-[18px]" />
      </motion.span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
