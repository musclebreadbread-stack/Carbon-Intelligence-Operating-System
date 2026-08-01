/**
 * RBAC catalogue coverage.
 *
 * `runAction` calls `requirePermission(session, resource, action)`, and `can()` resolves
 * that against the `Permission` rows a role holds. So a permission the code enforces but
 * the catalogue does not offer is *unguardable*: no role except the wildcard
 * administrator can ever hold it, and the failure is a silent 403 with no indication
 * that the permission does not exist to be granted.
 *
 * That had actually happened. The catalogue offered `rule`, `credit` and `ai` while the
 * actions enforce `validation_rule`, `carbon_credit` and `ai_analysis`, and `data_source`
 * and `notification` were missing entirely — so a sustainability manager holding
 * `credit:create` still could not retire a credit, and nothing said why.
 *
 * This test scans the action modules and the gateway handlers for the pairs they
 * actually enforce and requires each to exist in the catalogue. It is deliberately a
 * source scan rather than a hand-written list, because a hand-written list is the thing
 * that drifted.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEMO_ACTIONS, DEMO_PERMISSIONS, DEMO_RESOURCES, DEMO_ROLES } from "./security";

const ACTIONS_DIR = join(process.cwd(), "src", "lib", "actions");
const API_DIR = join(process.cwd(), "src", "app", "api", "v1");

/** Every `.ts`/`.tsx` file under `dir`, recursively, excluding tests. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * Extracts the `(resource, action)` pairs a source file declares.
 *
 * Both the `runAction` definition object and `withApiKey`'s options put `resource` and
 * `action` on adjacent lines, so pairing consecutive matches is reliable here. A file
 * that declares one without the other would leave an unpaired match, which the
 * assertion below reports rather than skipping.
 */
function enforcedPairs(source: string): { resource: string; action: string }[] {
  const pairs: { resource: string; action: string }[] = [];
  const pattern =
    /resource:\s*"([a-z_]+)"\s*,\s*(?:\/\/[^\n]*\n\s*)?action:\s*"([a-z_]+)"/g;
  for (const match of source.matchAll(pattern)) {
    pairs.push({ resource: match[1], action: match[2] });
  }
  return pairs;
}

const enforced = [...sourceFiles(ACTIONS_DIR), ...sourceFiles(API_DIR)].flatMap((path) =>
  enforcedPairs(readFileSync(path, "utf8")).map((pair) => ({ ...pair, path })),
);

const catalogue = new Set(
  DEMO_PERMISSIONS.map((permission) => `${permission.resource}:${permission.action}`),
);

describe("RBAC catalogue coverage", () => {
  it("finds the enforced permission pairs to check", () => {
    // A regex that silently matched nothing would make every assertion below vacuous.
    expect(enforced.length).toBeGreaterThan(20);
  });

  it("offers a Permission for every pair the server actions enforce", () => {
    const uncovered = enforced
      .filter((pair) => !catalogue.has(`${pair.resource}:${pair.action}`))
      .map((pair) => `${pair.resource}:${pair.action} (${pair.path})`);

    expect(uncovered).toEqual([]);
  });

  it("declares every enforced resource in DEMO_RESOURCES", () => {
    const resources = new Set<string>(DEMO_RESOURCES);
    const missing = [...new Set(enforced.map((pair) => pair.resource))].filter(
      (resource) => !resources.has(resource),
    );

    expect(missing).toEqual([]);
  });

  it("declares every enforced action in DEMO_ACTIONS", () => {
    const actions = new Set<string>(DEMO_ACTIONS);
    const missing = [...new Set(enforced.map((pair) => pair.action))].filter(
      (action) => !actions.has(action),
    );

    expect(missing).toEqual([]);
  });

  it("grants every permission a role references", () => {
    // The mirror of the check above: a role must not reference a permission id that no
    // longer exists after a rename.
    const permissionIds = new Set(DEMO_PERMISSIONS.map((permission) => permission.id));
    const dangling = DEMO_ROLES.flatMap((role) =>
      role.permissionIds
        .filter((id) => !permissionIds.has(id))
        .map((id) => `${role.id} -> ${id}`),
    );

    expect(dangling).toEqual([]);
  });

  it("lets a non-administrator role hold the capabilities its description claims", () => {
    // The concrete regression: these were ungrantable, so only the wildcard admin could
    // do them regardless of what a role was configured with.
    const manager = DEMO_ROLES.find(
      (role) => role.id === "demo-role-sustainability-manager",
    );
    expect(manager).toBeDefined();
    const held = new Set(manager?.permissionIds ?? []);
    for (const id of [
      "demo-perm-carbon_credit-retire",
      "demo-perm-validation_rule-execute",
      "demo-perm-ai_analysis-create",
      "demo-perm-notification-update",
    ]) {
      expect(held.has(id)).toBe(true);
    }
  });
});
