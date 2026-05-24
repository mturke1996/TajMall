"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { NAV } from "./nav-items";
import { isNavActive } from "./nav-active";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { usePermission } from "@/lib/supabase/use-permission";

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { can } = usePermission();

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="fixed inset-y-0 end-0 z-50 flex w-[280px] flex-col border-s border-border bg-canvas md:hidden"
        dir="rtl"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Header */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <Logo size="md" showTagline />
          <Button
            variant="ghost"
            size="icon"
            className="me-auto"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Nav - Fast links */}
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          {NAV.map((section) => (
            <div key={section.titleAr} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                {section.titleAr}
              </span>
              {section.items.map((item) => {
                if (item.permission && !can(item.permission)) {
                  return null;
                }
                const active = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-medium transition-colors duration-100",
                      active
                         ? "bg-canvas-sunken text-foreground ring-1 ring-border"
                        : "text-ink-mute hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[17px] w-[17px]",
                        active ? "text-sage-700" : "text-ink-mute",
                      )}
                    />
                    <span>{item.labelAr}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </motion.aside>
    </>
  );
}
