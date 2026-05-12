import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseUrl, getSupabasePublicKey } from './env';

type CookieItem = { name: string; value: string; options?: CookieOptions };

/**
 * Refreshes the Supabase session on every request and enforces auth
 * for protected routes.
 *
 * Why this exists: Server Components can't write cookies, so an expired
 * access token won't refresh on its own. Running this in middleware
 * ensures cookies are rotated before the page handler runs.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items: CookieItem[]) {
          items.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          items.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANT: do NOT run any code between createServerClient and getUser().
  // A simple mistake (auth state checks, redirects) here can cause hard-to-debug
  // logouts where the cookies get rotated but the request keeps the stale token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;
  const path = url.pathname;

  // Public routes that never require auth
  const isPublic =
    path === '/' ||
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/api/health') ||
    path.startsWith('/api/keepalive') ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/fonts') ||
    path === '/sw.js' ||
    path === '/manifest.webmanifest' ||
    path.startsWith('/icon-') ||
    path.startsWith('/apple-');

  // Unauthenticated → push to /login (preserving target as ?next=)
  if (!user && !isPublic) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', path);
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated user on /login → fast-forward to dashboard
  if (user && (path === '/login' || path === '/')) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = '/dashboard';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
