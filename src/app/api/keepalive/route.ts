import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Keep-alive endpoint to prevent Supabase free-tier inactivity suspension.
 * This endpoint is called periodically to keep the project active.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.KEEPALIVE_SECRET;
  return Boolean(secret && auth === `Bearer ${secret}`);
}

async function checkDatabaseConnectivity(): Promise<{
  success: boolean;
  message: string;
  duration: number;
}> {
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

async function checkSupabaseConnectivity(): Promise<{
  success: boolean;
  message: string;
  duration: number;
}> {
  const start = Date.now();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        success: false,
        message: "Missing Supabase credentials",
        duration: Date.now() - start,
      };
    }

    // Simple connectivity check - just verify the endpoint responds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - start;

      // Any response (even 401/403) means the service is alive
      return {
        success: true,
        message: `API responding (${response.status})`,
        duration,
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Even timeout/error triggers activity which keeps instance awake
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return {
          success: true,
          message: "Keep-alive activity triggered (timeout)",
          duration: Date.now() - start,
        };
      }

      // Other network errors still count as activity
      return {
        success: true,
        message: "Keep-alive activity triggered",
        duration: Date.now() - start,
      };
    }
  } catch (error) {
    return {
      success: true,
      message: "Keep-alive check completed",
      duration: Date.now() - start,
    };
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

    const success = checkRest.success && checkDb.success;

    const response = {
      ok: success,
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

    return NextResponse.json(response, {
      status: success ? 200 : 503,
    });
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
