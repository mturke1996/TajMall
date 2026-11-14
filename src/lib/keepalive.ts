/**
 * Health decision for the keepalive endpoint (pure, so it can be tested without a network).
 *
 * The endpoint exists for two reasons: to touch the project so a free-tier database is not paused for
 * inactivity, and to tell the scheduled GitHub workflow when the backend is NOT answering. The second only
 * works if a failed probe is reported as a failure. (An earlier version returned success for every error,
 * timeout and refusal, so an outage could never turn the workflow red.)
 */
export type ProbeResult = {
  success: boolean;
  message: string;
  duration: number;
};

export type ProbeOutcome =
  | { kind: 'response'; status: number }
  | { kind: 'timeout'; afterMs: number }
  | { kind: 'network-error' }
  | { kind: 'not-configured' };

/**
 * Any HTTP answer below 500 proves the API gateway is alive, including 401/403/404 (the REST root answers
 * differently depending on the key and project settings). A 5xx, a timeout, a refused connection and a
 * missing configuration are failures.
 */
export function interpretRestProbe(outcome: ProbeOutcome, duration: number): ProbeResult {
  switch (outcome.kind) {
    case 'response':
      return outcome.status < 500
        ? { success: true, message: `API responding (${outcome.status})`, duration }
        : { success: false, message: `API error (${outcome.status})`, duration };
    case 'timeout':
      return { success: false, message: `API did not answer within ${Math.round(outcome.afterMs / 1000)}s`, duration };
    case 'network-error':
      return { success: false, message: 'API unreachable (network error)', duration };
    case 'not-configured':
      return { success: false, message: 'Missing Supabase credentials', duration };
  }
}

/** The endpoint is healthy only when every probe passed; it answers 200, otherwise 503 so the workflow fails. */
export function overallHealth(probes: ProbeResult[]): { ok: boolean; status: 200 | 503 } {
  const ok = probes.length > 0 && probes.every((p) => p.success);
  return { ok, status: ok ? 200 : 503 };
}
