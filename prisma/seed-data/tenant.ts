/**
 * Demo-tenant seed data.
 *
 * This module is deliberately thin: it re-exports `DEMO_DATASET` from
 * `src/lib/data/demo` rather than restating it. That is the mechanism behind the
 * guarantee in decision 5 — demo mode and a seeded database show *identical*
 * numbers because they are literally reading the same arrays, not two copies that
 * drift apart on the first correction.
 *
 * The only thing added here is the credential material a fixture cannot carry: the
 * offline admin user's scrypt password digest.
 */

import { DEMO_DATASET, DEMO_ADMIN_USER_ID, demoActivityTotals } from "@/lib/data/demo";
import { hashPassword } from "@/lib/security/field-crypto";

export { DEMO_DATASET as SEED_TENANT, DEMO_ADMIN_USER_ID };

/**
 * Default password for the offline admin user.
 *
 * Real passwords live in Supabase Auth (decision 13); `User.passwordHash` exists
 * only so a deployment with no Supabase project still has an identity to attach
 * roles and API keys to. The seed prints a warning telling the operator to change
 * it, and the Korean setup guide repeats the instruction.
 */
export const SEED_ADMIN_DEFAULT_PASSWORD = "ChangeMe!CIOS-2025";

/** Env var an operator sets to avoid the default password ever existing. */
export const SEED_ADMIN_PASSWORD_ENV = "SEED_ADMIN_PASSWORD";

/**
 * Produces the admin user's `passwordHash`.
 *
 * scrypt rather than bcrypt: it is in Node's standard library, so there is no
 * native dependency to compile, and it is memory-hard, which bcrypt is not. The
 * digest is self-describing (`scrypt$N$r$p$salt$hash`), so the parameters can be
 * raised later without invalidating existing hashes.
 *
 * Salted, so this is intentionally *not* deterministic — two seed runs produce two
 * different digests for the same password. The integrity test asserts the format,
 * never the value.
 */
export function seedAdminPasswordHash(
  password: string = process.env[SEED_ADMIN_PASSWORD_ENV] ?? SEED_ADMIN_DEFAULT_PASSWORD,
): string {
  return hashPassword(password);
}

/** True when the operator has not overridden the default password. */
export function usingDefaultAdminPassword(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const configured = env[SEED_ADMIN_PASSWORD_ENV];
  return configured === undefined || configured.length === 0;
}

/**
 * Totals the seed must reproduce.
 *
 * Asserted by the integrity test against the fixture arrays, which is what turns
 * "the seed matches the fixtures" from a comment into a checked property.
 */
export const SEED_TENANT_TOTALS = {
  businessUnits: DEMO_DATASET.businessUnits.length,
  facilities: DEMO_DATASET.facilities.length,
  buildings: DEMO_DATASET.buildings.length,
  productionLines: DEMO_DATASET.productionLines.length,
  equipment: DEMO_DATASET.equipment.length,
  emissionSources: DEMO_DATASET.emissionSources.length,
  activityData: DEMO_DATASET.activityData.length,
  activityEntries: DEMO_DATASET.activityEntries.length,
  emissionFactors: DEMO_DATASET.emissionFactors.length,
  /**
   * Sum of every entry's reported quantity, keyed `emissionSourceId:unit`.
   *
   * Computed by the fixture module's own `demoActivityTotals()` rather than
   * re-derived here — the point of the parity test is that the seed and the
   * fixtures agree, which a second independent derivation would weaken.
   */
  quantityBySourceAndUnit: demoActivityTotals(),
} as const;
