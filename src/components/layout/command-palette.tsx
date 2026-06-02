"use client";

import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NAV } from "./nav-items";
import { usePermission } from "@/lib/supabase/use-permission";
import {
  Search,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
} from "lucide-react";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { can } = usePermission();

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">قائمة الأوامر</DialogTitle>
        <DialogDescription className="sr-only">
          ابحث، نفذ أمراً أو اقفز إلى أي صفحة
        </DialogDescription>

        <Command
          loop
          className="flex flex-col"
          filter={(value, search) => {
            if (!search) return 1;
            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
            if (search.split(" ").every((s) => value.toLowerCase().includes(s)))
              return 1;
            return 0;
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 stroke-[1.5] text-ink-mute" />
            <Command.Input
              placeholder="ابحث، نفذ أمراً، اقفز إلى صفحة…"
              className="flex h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-mute"
            />
            <kbd className="kbd">esc</kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2 no-scrollbar">
            <Command.Empty className="py-8 text-center text-[13px] text-ink-mute">
              لا توجد نتائج.
            </Command.Empty>

            {(can('revenue.create') || can('expense.create') || can('voucher.create')) && (
            <Command.Group
              heading="إجراءات سريعة"
              className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-ink-mute"
            >
              {can('revenue.create') && (
                <Item
                  onSelect={() => go("/revenues/new")}
                  icon={<ArrowDownToLine className="text-pastel-greenInk" />}
                  label="إضافة إيراد جديد"
                  shortcut="⌘⇧R"
                />
              )}
              {can('expense.create') && (
                <Item
                  onSelect={() => go("/expenses/new")}
                  icon={<ArrowUpFromLine className="text-pastel-redInk" />}
                  label="إضافة مصروف جديد"
                  shortcut="⌘⇧E"
                />
              )}
              {can('voucher.create') && (
                <Item
                  onSelect={() => go("/vouchers/new")}
                  icon={<Plus className="text-sage-700" />}
                  label="إذن صرف جديد"
                />
              )}
              {can('journal.view') && (
                <Item
                  onSelect={() => go("/journals")}
                  icon={<BookOpen className="text-pastel-blueInk" />}
                  label="فتح دفتر اليومية"
                />
              )}
            </Command.Group>
            )}

            {NAV.map((section) => (
              <Command.Group
                key={section.titleAr}
                heading={section.titleAr}
                className="px-1 mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-ink-mute"
              >
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Item
                      key={item.href}
                      onSelect={() => go(item.href)}
                      icon={<Icon />}
                      label={item.labelAr}
                      shortcut={item.shortcut}
                    />
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Item({
  onSelect,
  icon,
  label,
  shortcut,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-[13px] outline-none transition-colors duration-150 data-[selected=true]:bg-canvas-sunken data-[selected=true]:text-foreground"
    >
      <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card [&_svg]:size-[14px] [&_svg]:stroke-[1.5] [&_svg]:text-ink-mute">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && <kbd className="kbd">{shortcut}</kbd>}
    </Command.Item>
  );
}
