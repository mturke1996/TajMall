import { NextResponse } from 'next/server';

/**
 * Lightweight health probe.
 * Returns 200 OK with build/runtime info. Safe to call from
 * UptimeRobot, Vercel cron, or external monitoring.
 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'fluxen',
      ts: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
