import {
  Activity,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Bell,
  BookOpen,
  Building2,
  Coins,
  FileBarChart,
  FolderTree,
  Landmark,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icons referenced from Server Components must be keyed here — lucide components
 * are functions and cannot cross the Next.js Server → Client serialization boundary as props.
 */
export const FLUXEN_ICONS = {
  activity: Activity,
  bell: Bell,
  landmark: Landmark,
  coins: Coins,
  users: Users,
  'building-2': Building2,
  wallet: Wallet,
  'arrow-down-left': ArrowDownLeft,
  'arrow-up-right': ArrowUpRight,
  'arrow-down-line': ArrowDownToLine,
  'arrow-up-line': ArrowUpFromLine,
  'trending-up': TrendingUp,
  'file-bar-chart': FileBarChart,
  receipt: Receipt,
  'book-open': BookOpen,
  'folder-tree': FolderTree,
} as const satisfies Record<string, LucideIcon>;

export type FluxenIconKey = keyof typeof FLUXEN_ICONS;
