import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

/**
 * Match every route except Next.js internals and static assets.
 * Tweak this list if you add public folders (e.g. /brand-assets).
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next internals (static + image optimisation)
     * - favicon / icon-* / apple-* assets
     * - bundled fonts
     * - service worker, web manifest, robots, sitemap
     * - any file ending in a common static extension
     */
    '/((?!_next/static|_next/image|favicon|icon-|apple-|fonts|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)',
  ],
};
