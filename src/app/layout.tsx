import type { Metadata, Viewport } from 'next';
import {
  Cairo,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Instrument_Serif,
} from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { RegisterServiceWorker } from '@/components/pwa/register-sw';
import { InstallHint } from '@/components/pwa/install-hint';
import { BRAND } from '@/lib/brand';

const arabic = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const latin = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${BRAND.name} · ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: `${BRAND.fullName} — منصة لإدارة المول التجاري: إيرادات الإيجارات والخدمات، المصروفات التشغيلية، الخزائن، المستخدمين والصلاحيات، والتقارير المالية.`,
  applicationName: BRAND.name,
  authors: [{ name: BRAND.fullName }],
  manifest: '/manifest.webmanifest',

  icons: {
    icon: [{ url: '/TajMall-Icon.jpg', type: 'image/jpeg' }],
    apple: [{ url: '/TajMall-Icon.jpg', sizes: '180x180', type: 'image/jpeg' }],
    shortcut: '/TajMall-Icon.jpg',
  },

  openGraph: {
    type: 'website',
    locale: 'ar_LY',
    title: `${BRAND.name} · ${BRAND.tagline}`,
    description: BRAND.fullName,
    siteName: BRAND.name,
    images: [{ url: '/TajMall-Icon.jpg', width: 512, height: 512, alt: BRAND.fullName }],
  },

  // iPhone home-screen behaviour
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: 'default', // white status bar matching #FBFBFA
  },

  // Hide the title bar inside Safari when "Added to Home Screen"
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#171717' },
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // إحساس تطبيق ثابت — بلا تقريب/تبعيد بالإصبع
  viewportFit: 'cover', // edge-to-edge on iPhone notch
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${arabic.variable} ${latin.variable} ${serif.variable} ${mono.variable}`}
    >
      <head>
        {/* iOS standalone niceties not covered by the Metadata API */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={BRAND.name} />
        <link rel="apple-touch-icon" href="/TajMall-Icon.jpg" />
      </head>
      <body
        className="min-h-[100dvh] bg-background font-sans text-foreground"
        suppressHydrationWarning
        data-grammarly-disable="true"
      >
        <Providers>{children}</Providers>
        <Toaster />
        <RegisterServiceWorker />
        <InstallHint />
      </body>
    </html>
  );
}
