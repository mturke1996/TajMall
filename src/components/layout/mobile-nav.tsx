"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav-items";
import { isNavActive } from "./nav-active";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { usePermission } from "@/lib/supabase/use-permission";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        id="mobile-navigation"
        dir="rtl"
        className="inset-y-0 end-0 left-auto top-0 flex h-[100dvh] w-[min(88vw,340px)] max-h-none max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-e-0 p-0 shadow-lift md:hidden"
        aria-label="قائمة التنقل الرئيسية"
      >
        {/* Header */}
        <div
          className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <Logo size="md" showTagline />
          <DialogTitle className="sr-only">التنقل الرئيسي</DialogTitle>
        </div>

        {/* Nav - Fast links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3 pb-[calc(20px+env(safe-area-inset-bottom))]"
        >
          {NAV.map((section) => (
            <div key={section.titleAr} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1.5 text-[11.5px] font-semibold text-ink-mute">
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
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
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
                        active ? "text-foreground" : "text-ink-mute",
                      )}
                    />
                    <span>{item.labelAr}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
