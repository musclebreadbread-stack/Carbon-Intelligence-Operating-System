/**
 * Contract test between `.env.example` and the code that reads the environment.
 *
 * Two directions, both enforced:
 *
 * 1. Every key documented in `.env.example` is actually read somewhere in
 *    `src/**` or `prisma/**` — so the file cannot accumulate variables that do
 *    nothing (the Korean setup guide tells the user to configure these, and
 *    asking for a value that is never read is a lie).
 * 2. Every environment variable read by `src/**` is documented in
 *    `.env.example` — so a new `process.env.X` cannot become an undocumented
 *    deployment requirement.
 *
 * Runtime-provided variables (`NODE_ENV`, `PORT`, `HOSTNAME`, …) are exempt from
 * direction 2: the platform sets them, the operator does not.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const ENV_EXAMPLE = join(REPO_ROOT, ".env.example");

/** Variables the runtime or platform supplies, never the operator. */
const RUNTIME_PROVIDED = new Set(["NODE_ENV", "PORT", "HOSTNAME", "VERCEL", "VERCEL_URL", "CI"]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".prisma"];

type EnvExampleEntry = {
  readonly key: string;
  readonly value: string;
  /** Comment lines immediately above the assignment. */
  readonly comment: readonly string[];
};

/** Parses `.env.example` into keys, values and the comment block above each. */
export function parseEnvExample(contents: string): readonly EnvExampleEntry[] {
  const entries: EnvExampleEntry[] = [];
  let comment: string[] = [];

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) {
      const text = line.replace(/^#\s?/, "");
      // A rule of dashes is a section separator, not documentation.
      if (/^-{3,}|^[-\s]*$/.test(text) === false) comment.push(text);
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match === null) continue;
    entries.push({ key: match[1], value: match[2], comment });
    comment = [];
  }

  return entries;
}

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...listSourceFiles(path));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension))) found.push(path);
  }
  return found;
}

/** Uppercase env identifiers read as `process.env.X`, `process.env["X"]` or `env.X`. */
export function extractEnvReads(source: string): readonly string[] {
  const keys = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
    /\benv\.([A-Z][A-Z0-9_]{2,})\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) keys.add(match[1]);
  }
  return [...keys];
}

const envExample = readFileSync(ENV_EXAMPLE, "utf8");
const documented = parseEnvExample(envExample);
const documentedKeys = new Set(documented.map((entry) => entry.key));

const sourceFiles = [
  ...listSourceFiles(join(REPO_ROOT, "src")),
  ...listSourceFiles(join(REPO_ROOT, "prisma")),
];
const productionSources = sourceFiles.filter((path) => /\.test\.tsx?$/.test(path) === false);

describe(".env.example", () => {
  it("documents at least the four required variables", () => {
    for (const key of [
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]) {
      expect(documentedKeys).toContain(key);
    }
  });

  it("ships no values, so copying it cannot leak or fake a credential", () => {
    const withValues = documented.filter((entry) => entry.value.trim().length > 0);
    expect(withValues.map((entry) => entry.key)).toEqual([]);
  });

  it("explains every key with a comment above it", () => {
    const undocumented = documented
      .filter((entry) => entry.comment.length === 0)
      .map((entry) => entry.key);
    expect(undocumented).toEqual([]);
  });

  it("declares no key twice", () => {
    expect(documented.length).toBe(documentedKeys.size);
  });

  it("points at the Korean setup guide for the credentials the user must obtain", () => {
    expect(envExample).toContain("docs/CIOS-직접-설정-가이드.docx");
  });
});

describe("environment contract", () => {
  it("finds the source tree it is asserting against", () => {
    expect(productionSources.length).toBeGreaterThan(100);
  });

  it("has every documented key read by the code", () => {
    const sources = productionSources.map((path) => readFileSync(path, "utf8"));
    const unused = [...documentedKeys].filter(
      (key) => sources.some((source) => source.includes(key)) === false,
    );
    expect(unused).toEqual([]);
  });

  it("has every environment variable the code reads documented", () => {
    const missing = new Map<string, string>();
    for (const path of productionSources) {
      for (const key of extractEnvReads(readFileSync(path, "utf8"))) {
        if (RUNTIME_PROVIDED.has(key)) continue;
        if (documentedKeys.has(key)) continue;
        missing.set(key, path.slice(REPO_ROOT.length + 1));
      }
    }
    expect([...missing.entries()]).toEqual([]);
  });
});

describe("parseEnvExample", () => {
  it("keeps the comment block attached to the following key", () => {
    const parsed = parseEnvExample("# first line\n# second line\nKEY=\n\nOTHER=value\n");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ key: "KEY", value: "", comment: ["first line", "second line"] });
    expect(parsed[1]).toEqual({ key: "OTHER", value: "value", comment: [] });
  });

  it("ignores separator rules when collecting documentation", () => {
    const parsed = parseEnvExample("# --- section ---\nKEY=\n");
    expect(parsed[0].comment).toEqual([]);
  });
});

describe("extractEnvReads", () => {
  it("finds all three access forms and ignores lowercase members", () => {
    const source = [
      "const a = process.env.DATABASE_URL;",
      'const b = process.env["REDIS_URL"];',
      "const c = env.OPENAI_MODEL;",
      "const d = env.local;",
      "const e = config.baseUrl;",
    ].join("\n");
    expect([...extractEnvReads(source)].sort()).toEqual([
      "DATABASE_URL",
      "OPENAI_MODEL",
      "REDIS_URL",
    ]);
  });
});
