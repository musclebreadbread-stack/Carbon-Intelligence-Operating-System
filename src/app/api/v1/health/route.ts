/**
 * `GET /api/v1/health`
 *
 * Unauthenticated on purpose: this is the endpoint a load balancer and a first-time
 * operator both hit, and requiring a key would make "is the deployment
 * misconfigured?" unanswerable exactly when it matters. It therefore reports only
 * *whether* each dependency is configured — never a URL, a key prefix or a version
 * that would help an attacker fingerprint the deployment.
 *
 * The LLM labels are returned in English and Korean so the settings page and the
 * Korean setup guide can show the same wording without duplicating it.
 */

import { connection } from "next/server";

import { describeLlmMode, isLlmConfigured } from "@/lib/ai/llm/factory";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { dbUnconfiguredReason, getDataMode, getFallbackReason } from "@/lib/data/db";

import { jsonOk } from "../_lib/handler";

export async function GET() {
  // Decision 6: `connection()` rather than `export const dynamic`. Health has to
  // reflect the running process, so it must never be prerendered.
  await connection();

  const llm = describeLlmMode();

  // `getDataMode()` reports the *observed* mode, and the process starts
  // optimistically in `"database"`: nothing has entered demo mode until some
  // repository read has gone through `withDb()` and failed. On a freshly booted
  // process with no `DATABASE_URL` — exactly the state a first-time operator hits
  // this endpoint in — the observed mode is therefore a lie. Every field below is
  // resolved against the *configuration* as well as the observation, so the report
  // is conservative rather than optimistic. `dbUnconfiguredReason()` is used instead
  // of flipping the mode here, because a GET must not have the side effect of
  // putting the process into demo mode.
  const unconfiguredReason = dbUnconfiguredReason();
  const configured = unconfiguredReason === null;
  const observedMode = getDataMode();
  const dataMode = configured ? observedMode : "demo";

  return jsonOk({
    status: "ok",
    database: {
      configured,
      mode: dataMode,
      // Explains *why* the process is serving fixtures, which is the one piece of
      // detail an operator needs and an attacker cannot use. An observed fallback
      // reason (a reachability failure) is more specific than the configuration
      // one, so it wins when both apply.
      fallbackReason: getFallbackReason() ?? unconfiguredReason,
    },
    supabase: { configured: isSupabaseConfigured() },
    llm: {
      configured: isLlmConfigured(),
      mode: llm.mode,
      model: llm.model,
      label: llm.label,
      labelKo: llm.labelKo,
    },
    // A deployment in demo mode is functional but read-only; saying so here stops
    // an integrator wondering why their POST returns 503. This used to be
    // `getDataMode() === "database"` on its own, which reported
    // `"writable":true` on a fresh process with no `DATABASE_URL` at all and made
    // `/api-gateway` show "Accepting writes: yes" while every mutation was in fact
    // being refused with `DEMO_MODE`.
    writable: dataMode === "database",
  });
}
