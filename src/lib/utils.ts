import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const arabicMonths = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export function formatDate(d: Date | string | number, locale: 'ar' | 'en' = 'ar') {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.getMonth();
  const year = date.getFullYear();
  if (locale === 'ar') {
    return `${day} ${arabicMonths[month]} ${year}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatShortDate(d: Date | string | number) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function formatMoney(
  amount: number | string | bigint,
  currency: string = 'LYD',
  options?: { compact?: boolean; signed?: boolean },
) {
  const n = typeof amount === 'string' ? Number(amount) : Number(amount);
  if (!Number.isFinite(n)) return '0';

  const sign = options?.signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : '';
  const abs = Math.abs(n);

  if (options?.compact && abs >= 1000) {
    const formatter = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    });
    return `${sign}${formatter.format(abs)} ${currency}`;
  }

  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  return `${sign}${formatter.format(abs)} ${currency}`;
}

export function formatNumber(n: number | string, fractionDigits: number = 0) {
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num);
}

export function formatPercent(n: number, fractionDigits: number = 1) {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(fractionDigits)}%`;
}

export function deltaPercent(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function formatDateRelative(date: Date | string | number) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 7) return `منذ ${days} يوم`;
  if (days < 30) return `منذ ${Math.floor(days / 7)} أسبوع`;
  if (days < 365) return `منذ ${Math.floor(days / 30)} شهر`;
  return `منذ ${Math.floor(days / 365)} سنة`;
}
