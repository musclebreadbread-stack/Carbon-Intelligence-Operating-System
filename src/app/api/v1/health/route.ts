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
import { getDataMode, getFallbackReason, isDbConfigured } from "@/lib/data/db";

import { jsonOk } from "../_lib/handler";

export async function GET() {
  // Decision 6: `connection()` rather than `export const dynamic`. Health has to
  // reflect the running process, so it must never be prerendered.
  await connection();

  const llm = describeLlmMode();
  const dataMode = getDataMode();

  return jsonOk({
    status: "ok",
    database: {
      configured: isDbConfigured(),
      mode: dataMode,
      // Explains *why* the process is serving fixtures, which is the one piece of
      // detail an operator needs and an attacker cannot use.
      fallbackReason: getFallbackReason(),
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
    // an integrator wondering why their POST returns 503.
    writable: dataMode === "database",
  });
}
