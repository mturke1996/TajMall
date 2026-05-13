import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keep-alive endpoint to prevent Supabase free-tier inactivity suspension.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
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
    // Simple ping to keep the project active
    return NextResponse.json({
      ok: true,
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
