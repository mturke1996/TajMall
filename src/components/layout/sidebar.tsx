"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "./nav-items";
import { isNavActive } from "./nav-active";
import { Logo } from "@/components/brand/logo";
import { SidebarProfile } from "./sidebar-profile";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { usePermission } from "@/lib/supabase/use-permission";

export function Sidebar({
  collapsed,
  onToggle,
  className,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { can } = usePermission();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <aside
        className={cn(
          "sticky top-0 z-20 hidden h-[100dvh] shrink-0 flex-col border-e border-border bg-canvas md:flex",
          collapsed ? "w-[72px]" : "w-[260px]",
          className,
        )}
        dir="rtl"
      />
    );
  }

  return (
    <aside
      className={cn(
        "sticky top-0 z-20 hidden h-[100dvh] shrink-0 flex-col border-e border-border bg-canvas md:flex",
        "transition-[width] duration-200 ease-out-quart",
        collapsed ? "w-[72px]" : "w-[260px]",
        className,
      )}
      dir="rtl"
    >
      {/* Brand header */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        {collapsed ? <Logo size="sm" /> : <Logo size="md" showTagline />}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "me-auto rounded-lg p-1.5 text-muted-foreground hover:bg-canvas-sunken hover:text-foreground transition-all duration-150 active:scale-95",
              collapsed && "me-0 mx-auto",
            )}
            aria-label={collapsed ? "توسيع الشريط الجانبي" : "طي الشريط الجانبي"}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                !collapsed && "rotate-180",
              )}
            />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-3 no-scrollbar">
        {NAV.map((section, si) => (
          <div
            key={section.titleAr}
            className="flex flex-col gap-0.5 pb-3 last:pb-1"
          >
            {/* Section label */}
            <span
              className={cn(
                "px-3 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-[0.20em] text-muted-foreground/70 transition-opacity duration-150",
                collapsed && "sr-only",
              )}
            >
              {section.titleAr}
            </span>

            {/* Nav items */}
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
                  title={collapsed ? item.labelAr : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-100",
                    "active:scale-[0.97]",
                    active
                      ? [
                          "bg-canvas-sunken text-foreground shadow-whisper",
                          "before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-primary dark:before:bg-primary",
                        ]
                      : "text-muted-foreground hover:bg-canvas-sunken/70 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[17px] w-[17px] shrink-0 transition-colors duration-100",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground/70 group-hover:text-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate transition-all duration-150",
                      collapsed && "pointer-events-none w-0 opacity-0",
                    )}
                  >
                    {item.labelAr}
                  </span>

                  {/* Keyboard shortcut badge */}
                  {!collapsed && item.shortcut && !active && (
                    <kbd className="kbd ms-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      {item.shortcut}
                    </kbd>
                  )}

                  {/* Badge */}
                  {!collapsed && item.badge && (
                    <span
                      className={cn(
                        "ms-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                        item.badge.tone === 'danger'
                          ? "bg-rose-500 text-white"
                          : item.badge.tone === 'success'
                          ? "bg-emerald-500 text-white"
                          : item.badge.tone === 'warning'
                          ? "bg-amber-400 text-amber-900"
                          : "bg-canvas-sunken text-foreground",
                      )}
                    >
                      {item.badge.text}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Section divider */}
            {si < NAV.length - 1 && !collapsed && (
              <div className="mx-3 mt-2 border-b border-border/50" aria-hidden />
            )}
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div className="border-t border-border p-2.5">
        <SidebarProfile collapsed={collapsed} />
      </div>
    </aside>
  );
}
