/**
 * Content Security Policy, delivered REPORT-ONLY: the browser reports what it would block (the console shows
 * each violation) but blocks nothing, so it cannot break the app. After a few days of normal use with no
 * violations in the console it can be switched to enforcing by renaming the header to
 * "Content-Security-Policy".
 *
 * What the app loads (read from the code):
 *  - scripts and styles: its own bundles, plus the inline bootstrap scripts and style attributes Next,
 *    next-themes, sonner and framer-motion write. A nonce would need every page rendered per request, which
 *    the static shells are not, so 'unsafe-inline' stays for scripts and styles. It still stops a script or
 *    stylesheet from another host, and stops data being sent to a host that is not Supabase.
 *  - fonts: next/font self-hosts Cairo and the others; the PDF fonts and logo come from /fonts and /public.
 *  - Supabase: REST, auth and realtime (https and wss) on the project host.
 *  - PDFs: react-pdf builds a Blob and the app shows it in an <embed>/<iframe> and opens it as a blob: URL.
 *  - images: its own, data: and blob: (PDF logos, previews).
 * Development is skipped: React's dev tooling needs eval.
 */
function contentSecurityPolicy() {
  let supabaseOrigins = ['https://*.supabase.co', 'wss://*.supabase.co'];
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (u.protocol === 'https:') {
      supabaseOrigins = [`https://${u.host}`, `wss://${u.host}`];
    }
  } catch {
    /* not configured at build time: keep the wildcard */
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigins.join(' ')}`,
    "frame-src 'self' blob:",
    "object-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // no "X-Powered-By: Next.js": it only tells a scanner which framework to try exploits for
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  // `next build` type-checks; ESLint runs separately (`npm run lint`, also in CI) since
  // Next 16 no longer lints during the build.
  typescript: { ignoreBuildErrors: false },
  async redirects() {
    return [
      // /boss دُمجت في /users (كانت صفحة مكرّرة لنفس إدارة المستخدمين)
      { source: '/boss', destination: '/users', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // https only for a year; no includeSubDomains/preload: this runs on a platform domain, not one
          // the owner controls, so a rule for its subdomains is not theirs to make
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          // nothing in the app uses these; clipboard and share are left at their defaults on purpose
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), accelerometer=(), gyroscope=(), magnetometer=()',
          },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          // a window opened from another site (or one this app opens) cannot reach back into the app
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          ...(isProduction
            ? [{ key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy() }]
            : []),
        ],
      },
      {
        // the tenant's private link: the token is in the URL, so it must not leave in a Referer header, be
        // indexed, or sit in a shared cache. Listed after the rule above so these values win.
        source: '/portal/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        // emailed-link handlers: the URL carries a one-time token and the answer sets the session
        source: '/auth/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300' },
        ],
      },
    ];
  },
};

export default nextConfig;
