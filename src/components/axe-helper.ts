/**
 * axe-core test helper.
 *
 * Wraps axe-core's `run()` for use in vitest with jsdom.
 */

import axe, { type Result } from "axe-core";

/**
 * Configure axe with reasonable defaults for component testing.
 */
export function configureAxe() {
  axe.configure({
    rules: [
      // Disable rules that don't apply to component-level testing
      { id: "document-title", enabled: false },
      { id: "html-has-lang", enabled: false },
      { id: "landmark-one-main", enabled: false },
      { id: "page-has-heading-one", enabled: false },
      { id: "region", enabled: false },
    ],
  });
}

/**
 * Run axe on a container element and return violations.
 */
export async function getViolations(container: Element): Promise<Result[]> {
  configureAxe();
  const results = await axe.run(container as HTMLElement);
  return results.violations;
}
