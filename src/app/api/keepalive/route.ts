import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { bearerToken, safeEqual } from "@/lib/supabase/request-guard";
import { interpretRestProbe, overallHealth, type ProbeResult } from "@/lib/keepalive";

/**
 * Keep-alive and health endpoint, called on a schedule by .github/workflows/keepalive.yml.
 * It touches the project (so a free-tier database is not paused for inactivity) and reports honestly
 * whether the backend answered: any failed probe makes this endpoint answer 503, which turns the
 * workflow red. See src/lib/keepalive.ts for the decision rules.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REST_TIMEOUT_MS = 8000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.KEEPALIVE_SECRET;
  const token = bearerToken(req);
  // constant-time comparison: a plain === tells a caller, by response time, how many leading characters matched
  return Boolean(secret && token && safeEqual(token, secret));
}

async function checkDatabaseConnectivity(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const supabase = createSupabaseAdminClient();
    // Query a lightweight table to verify database connectivity and trigger activity
    const { error } = await supabase.from("branches").select("id").limit(1);

    if (error) {
      throw error;
    }

    return {
      success: true,
      message: "Database ping successful",
      duration: Date.now() - start,
    };
  } catch (error) {
    console.error("[keepalive] Database ping failed:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Database ping failed",
      duration: Date.now() - start,
    };
  }
}

async function checkSupabaseConnectivity(): Promise<ProbeResult> {
  const start = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return interpretRestProbe({ kind: "not-configured" }, Date.now() - start);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
      },
      signal: controller.signal,
    });
    return interpretRestProbe({ kind: "response", status: response.status }, Date.now() - start);
  } catch {
    // the error text can carry the request URL: only its kind is reported
    return interpretRestProbe(
      controller.signal.aborted
        ? { kind: "timeout", afterMs: REST_TIMEOUT_MS }
        : { kind: "network-error" },
      Date.now() - start,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(req: NextRequest) {
  const requestStart = Date.now();

  if (!authorized(req)) {
    console.warn("[keepalive] Unauthorized request");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    console.log("[keepalive] Starting health check");
    const checkRest = await checkSupabaseConnectivity();
    const checkDb = await checkDatabaseConnectivity();

    const health = overallHealth([checkRest, checkDb]);

    const response = {
      ok: health.ok,
      timestamp: new Date().toISOString(),
      restApi: {
        connected: checkRest.success,
        status: checkRest.message,
        responseTimeMs: checkRest.duration,
      },
      database: {
        connected: checkDb.success,
        status: checkDb.message,
        responseTimeMs: checkDb.duration,
      },
      totalTimeMs: Date.now() - requestStart,
    };

    console.log(
      `[keepalive] Completed - REST: ${checkRest.message} (${checkRest.duration}ms), DB: ${checkDb.message} (${checkDb.duration}ms)`,
    );

    return NextResponse.json(response, { status: health.status });
  } catch (error) {
    console.error("[keepalive] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
