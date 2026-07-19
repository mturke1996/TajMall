import { NextResponse } from 'next/server';

/**
 * Lightweight health probe — لا يكشف وجود أسرار البيئة.
 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'fluxen',
      ts: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
