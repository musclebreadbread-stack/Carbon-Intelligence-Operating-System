import { prisma } from "@/lib/prisma";

import { getDataMode, isDbConfigured } from "./db";

const PROBE_TIMEOUT_MS = 1_000;
const PROBE_CACHE_MS = 5_000;

export type DatabaseReadiness = {
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly writable: boolean;
};

let cached: { readonly expiresAt: number; readonly value: DatabaseReadiness } | null = null;

/**
 * Bounded, cached readiness probe. Configuration is syntax only; reachability is
 * established by a constant-time query and writability additionally respects an
 * observed fixture fallback.
 */
export async function probeDatabaseReadiness(): Promise<DatabaseReadiness> {
  if (!isDbConfigured()) {
    return { configured: false, reachable: false, writable: false };
  }

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
  });
  const query = prisma.$queryRaw`SELECT 1`
    .then(() => true as const)
    .catch(() => false as const);
  const reachable = await Promise.race([query, timeout]);
  if (timer) clearTimeout(timer);

  const value = {
    configured: true,
    reachable,
    writable: reachable && getDataMode() === "database",
  };
  cached = { expiresAt: now + PROBE_CACHE_MS, value };
  return value;
}

/** Test-only cache reset. */
export function resetDatabaseReadinessProbe(): void {
  cached = null;
}
