"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "./nav-items";
import { isNavActive } from "./nav-active";
import { Logo } from "@/components/brand/logo";
import { SidebarProfile } from "./sidebar-profile";
import { cn } from "@/lib/utils";

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
        "transition-[width] duration-150 ease-out",
        collapsed ? "w-[72px]" : "w-[260px]",
        className,
      )}
      dir="rtl"
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        {collapsed ? <Logo size="sm" /> : <Logo size="md" showTagline />}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "me-auto rounded-md p-1.5 text-ink-mute hover:bg-secondary transition-colors duration-100",
              collapsed && "me-0 mx-auto",
            )}
          >
            <svg
              className={cn(
                "h-4 w-4 transition-transform duration-100",
                collapsed && "rotate-180",
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Nav - Fast links with prefetch */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {NAV.map((section, si) => (
          <div
            key={section.titleAr}
            className="flex flex-col gap-0.5 pb-4 last:pb-2"
          >
            <span
              className={cn(
                "px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute",
                collapsed && "sr-only",
              )}
            >
              {section.titleAr}
            </span>
            {section.items.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-100 active:scale-[0.97]",
                    active
                      ? "bg-canvas-sunken text-foreground shadow-sm ring-1 ring-border before:absolute before:inset-y-1 before:start-0 before:w-[3px] before:rounded-full before:bg-sage-600"
                      : "text-ink-mute hover:bg-secondary/70 hover:text-foreground",
                  )}
                  title={collapsed ? item.labelAr : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-[17px] w-[17px] shrink-0 transition-colors",
                      active
                        ? "text-sage-700"
                        : "text-ink-mute group-hover:text-sage-600",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate transition-opacity",
                      collapsed && "pointer-events-none w-0 opacity-0",
                    )}
                  >
                    {item.labelAr}
                  </span>
                </Link>
              );
            })}
            {si < NAV.length - 1 && !collapsed ? (
              <div
                className="mx-3 mt-3 border-b border-border/80"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </nav>

      {/* Profile */}
      <div className="border-t border-border p-3">
        <SidebarProfile collapsed={collapsed} />
      </div>
    </aside>
  );
}
