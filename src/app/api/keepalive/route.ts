import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keep-alive endpoint to prevent Supabase free-tier inactivity suspension.
 *
 * Runs every 6 hours via Vercel Cron (see vercel.json) and performs a
 * tiny no-op query against the database to keep the connection warm.
 *
 * Protected with KEEPALIVE_SECRET. Vercel cron requests are signed with
 * the user-agent "vercel-cron/1.0" — we accept either path.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function pingDatabase() {
  // Lazy-load so the edge runtime doesn't try to bundle Prisma.
  const { prisma } = await import('@/lib/prisma');
  // SELECT 1 — cheapest possible query, doesn't allocate memory.
  const result = await prisma.$queryRawUnsafe<Array<{ ok: number }>>('SELECT 1 as ok');
  return result?.[0]?.ok === 1;
}

function authorized(req: NextRequest): boolean {
  const userAgent = req.headers.get('user-agent') ?? '';
  if (userAgent.startsWith('vercel-cron')) return true;

  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.KEEPALIVE_SECRET;
  return Boolean(secret && auth === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const start = Date.now();
    const ok = await pingDatabase();
    return NextResponse.json({
      ok,
      pingedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    console.error('[keepalive] ping failed', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
