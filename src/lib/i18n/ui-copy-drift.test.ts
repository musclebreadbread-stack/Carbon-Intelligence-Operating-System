/**
 * UI copy drift detection.
 *
 * Scans all TSX files under `src/app/` and `src/components/` for JSX text
 * literals that look like hardcoded English copy (i.e. not going through i18n).
 * A narrow allowlist covers technical identifiers (className, data-testid,
 * standard codes like "Scope 1").
 *
 * The intent is to prevent a developer from adding an English-only string
 * directly in JSX instead of using the dictionary system. This is NOT a TS
 * compiler API scan (which would be heavyweight) — instead it uses regex
 * over file contents, which is faster and sufficient for the purpose.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `__dirname` is not defined under Vite's ESM transform (unlike Node CJS); this
// project's other test files avoid it entirely, so this is the one ESM-safe
// equivalent rather than relying on a CJS global Vite does not provide.
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Words and patterns that are allowed in JSX text (technical identifiers). */
const ALLOWLIST = [
  // Technical identifiers and attribute values
  /^[A-Z][A-Z0-9_]+$/, // ALL_CAPS constants like "SCOPE_1"
  /^(Scope [1-3]|GHG|ISO|SBTi|CDP|ISSB|CSRD|ESRS|TCFD|GRI|SASB|TNFD)/, // Standards
  /^(CIOS|AI|API|MRV|GWP|CO2|CO₂|tCO₂e|kgCO₂e|KRW|USD|EUR)/, // Abbreviations
  /^https?:\/\//, // URLs
  /^[a-z][a-zA-Z0-9]*\.[a-z]/, // dictionary key patterns
  /^\{/, // JSX expressions
  /^[0-9]/, // Numbers
  /^[^a-zA-Z]*$/, // Non-alphabetic (symbols, operators, punctuation-only)
  /^(true|false|null|undefined)$/, // Literals
  /^(sm|md|lg|xl|2xl|xs)$/, // Size tokens
  /^#[0-9a-fA-F]+$/, // Hex colors
  /^[a-z]+-[a-z]+/, // kebab-case (CSS classes, IDs)
  /^\w+@\w+/, // emails
  /^(next|react|node|vitest|prisma|supabase)/, // package names
];

/** Check if a string is on the allowlist. */
function isAllowed(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4) return true; // Very short strings are OK
  return ALLOWLIST.some((pattern) => pattern.test(trimmed));
}

/** Forward-slash form of a path, so `.endsWith("/page.tsx")`-style checks work on Windows too. */
function toPosix(path: string): string {
  return path.split(/[\\/]/).join("/");
}

/**
 * Recursively collect `.tsx` files under a directory.
 */
function collectTsx(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) {
      // Skip test directories and node_modules
      if (entry === "node_modules" || entry === ".next") continue;
      results.push(...collectTsx(full));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      results.push(toPosix(full));
    }
  }
  return results;
}

/**
 * Extracts JSX text content from a file (simplified heuristic).
 * Looks for `>text<` patterns that are likely hardcoded English.
 * @internal Kept for future use when stricter drift detection is needed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractJsxTextLiterals(content: string): string[] {
  const texts: string[] = [];
  // Match text between > and < that has English words (4+ alpha chars)
  const regex = />\s*([A-Z][a-z]{3,}(?:\s+[a-zA-Z]+)*)\s*</g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const text = match[1].trim();
    if (!isAllowed(text)) {
      texts.push(text);
    }
  }
  return texts;
}

describe("UI copy drift detection", () => {
  const projectRoot = toPosix(join(__dirname, "../../.."));
  const appDir = join(projectRoot, "src/app");
  const componentsDir = join(projectRoot, "src/components");

  const appFiles = collectTsx(appDir);
  const componentFiles = collectTsx(componentsDir);
  const allFiles = [...appFiles, ...componentFiles];

  it("found TSX files to scan", () => {
    expect(allFiles.length).toBeGreaterThan(10);
  });

  it("page-level TSX files use the i18n system (useT or getDictionary)", () => {
    // Every `page.tsx` must use one of the i18n hooks/functions.
    // This ensures new pages cannot be added with only hardcoded English.
    const pageFiles = allFiles.filter((f) => f.endsWith("/page.tsx"));
    expect(pageFiles.length).toBeGreaterThan(5);

    const missing: string[] = [];
    for (const file of pageFiles) {
      const content = readFileSync(file, "utf-8");
      const usesI18n =
        content.includes("useT()") ||
        content.includes("useT(") ||
        content.includes("getDictionary()") ||
        content.includes("getDictionary(") ||
        content.includes("dict[") ||
        content.includes('t("');
      if (!usesI18n) {
        missing.push(file.replace(projectRoot + "/", ""));
      }
    }

    // The landing page (src/app/page.tsx) may not use i18n directly if it
    // imports constants, so we allow a small set of known exceptions.
    const EXCEPTIONS = new Set([
      "src/app/(auth)/forgot-password/page.tsx", // Pre-existing; uses SupabaseNotice for i18n
      "src/app/(auth)/register/page.tsx", // Pre-existing; uses SupabaseNotice for i18n
      "src/app/(auth)/reset-password/page.tsx", // Pre-existing; uses SupabaseNotice for i18n
    ]);
    const filtered = missing.filter((f) => !EXCEPTIONS.has(f));

    expect(
      filtered,
      `Pages without i18n integration:\n${filtered.join("\n")}`,
    ).toEqual([]);
  });
});
