import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * Match every route except Next.js internals and static assets.
 * Tweak this list if you add public folders (e.g. /brand-assets).
 */
export const config = {
  matcher: [
    {
      /*
       * Match all request paths except:
       * - _next internals (static + image optimisation)
       * - favicon / icon-* / apple-* assets
       * - bundled fonts
       * - service worker, web manifest, robots, sitemap
       * - setup page (shown when not configured)
       * - any file ending in a common static extension
       */
      source:
        '/((?!_next/static|_next/image|favicon|icon-|apple-|fonts|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|setup|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)',
      /*
       * Link prefetches skip the proxy. Next prefetches every link in view (about 25 per page from
       * the sidebar) and each one waited on its own round trip to Supabase Auth. App pages are
       * static shells that load their data in the browser under RLS, and API routes check the
       * caller themselves, so a prefetch carries nothing private; real navigations still pass
       * through here to verify and refresh the session.
       */
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
