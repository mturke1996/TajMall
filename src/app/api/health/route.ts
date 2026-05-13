import { NextResponse } from 'next/server';

/**
 * Lightweight health probe.
 * Returns 200 OK with build/runtime info. Safe to call from
 * UptimeRobot, Vercel cron, or external monitoring.
 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasSupabasePublicKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
  const hasServiceRole = Boolean(
    process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );

  return NextResponse.json(
    {
      ok: true,
      service: 'fluxen',
      ts: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      /** هل يرى الخادوم المتغيرات؟ (لا تُعرض القيم — فقط نعم/لا) */
      env: {
        NEXT_PUBLIC_SUPABASE_URL: hasSupabaseUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY: hasSupabasePublicKey,
        DATABASE_URL: hasDatabaseUrl,
        SUPABASE_SERVICE_ROLE: hasServiceRole,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
