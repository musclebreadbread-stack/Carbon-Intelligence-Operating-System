/**
 * Clean-clone contract: the repository must install, build and boot with **no
 * environment file at all**.
 *
 * This is the sibling of `src/lib/env.test.ts`. That file enforces the contract
 * between `.env.example` and the variables the code reads; this one enforces
 * that none of those variables is needed to get started, which is what the
 * README quick start and demo mode promise.
 *
 * It exists because the promise was never actually exercised: every local check
 * ran in a working tree that still had a leftover `.env`, and CI supplies
 * placeholder values inline, so an install- or boot-time dependency on
 * `DATABASE_URL` could have gone unnoticed. `prisma generate` happens to resolve
 * no datasource URL in Prisma 6, but `prisma validate`, `migrate` and `db push`
 * do (P1012) — so which Prisma subcommand runs during `npm ci` is load-bearing
 * and asserted here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isLlmConfigured } from "@/lib/ai/llm/factory";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/data/db";

const REPO_ROOT = process.cwd();

function readRepoFile(name: string): string {
  return readFileSync(join(REPO_ROOT, name), "utf8");
}

const packageJson = JSON.parse(readRepoFile("package.json")) as {
  readonly engines?: Record<string, string>;
  readonly scripts?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
const readme = readRepoFile("README.md");
const gitignore = readRepoFile(".gitignore");
const envExample = readRepoFile(".env.example");

/** npm lifecycle scripts that `npm ci` runs before anyone can set a variable. */
const INSTALL_LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepack"] as const;

/**
 * Prisma subcommands that resolve `env("DATABASE_URL")` / `env("DIRECT_URL")`
 * from the schema and therefore fail with P1012 when they are unset. Running any
 * of these from an install hook breaks a clean clone.
 */
const DATASOURCE_RESOLVING_SUBCOMMANDS = [
  "validate",
  "migrate",
  "db push",
  "db pull",
  "db execute",
  "db seed",
  "studio",
] as const;

/** The first fenced code block following a heading, without its fence lines. */
export function extractCodeBlock(markdown: string, heading: string): readonly string[] {
  const afterHeading = markdown.slice(markdown.indexOf(heading));
  const open = afterHeading.indexOf("```");
  const body = afterHeading.slice(afterHeading.indexOf("\n", open) + 1);
  return body
    .slice(0, body.indexOf("```"))
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Strips a trailing `# comment` so a documented command can be compared. */
function commandOf(line: string): string {
  return line.replace(/\s+#.*$/, "").trim();
}

describe("installing needs no environment variables", () => {
  it("generates the Prisma client on postinstall, the one subcommand that needs no datasource", () => {
    expect(scripts.postinstall).toBe("prisma generate");
  });

  it("runs no datasource-resolving Prisma command from an install hook", () => {
    const offenders: string[] = [];
    for (const lifecycle of INSTALL_LIFECYCLE) {
      const script = scripts[lifecycle];
      if (script === undefined) continue;
      for (const subcommand of DATASOURCE_RESOLVING_SUBCOMMANDS) {
        if (new RegExp(`prisma\\s+${subcommand}\\b`).test(script)) {
          offenders.push(`${lifecycle}: prisma ${subcommand}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Runs `body` with `DATABASE_URL` removed from the process environment, restoring
 * whatever was there afterwards.
 *
 * This has to be explicit. `isDbConfigured()` defaults its argument to
 * `process.env.DATABASE_URL`, so calling it with an explicit `undefined` consults
 * the ambient environment instead of asserting the absent case — and the ambient
 * environment is not empty just because nothing in this file set it: importing
 * `@prisma/client` loads whatever `.env` the client was generated against, because
 * `prisma generate` bakes the discovered path in as `schemaEnvPath`. A developer who
 * followed the setup guide and created a `.env` therefore ran `npm ci`, got a client
 * that loads it, and saw this suite go red — while CI, which has no `.env` at all,
 * stayed green. The clean-clone contract has to be asserted against a clean
 * environment, not against whichever one the machine happens to have.
 */
function withoutDatabaseUrl(body: () => void): void {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    body();
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
}

describe("a clean clone lands in demo mode, not in a broken state", () => {
  it("treats an absent, empty or blank DATABASE_URL as unconfigured", () => {
    withoutDatabaseUrl(() => {
      for (const url of [undefined, "", "   "]) {
        expect(isDbConfigured(url)).toBe(false);
      }
      // The no-argument form is the one the application actually calls.
      expect(isDbConfigured()).toBe(false);
    });
  });

  it("reads the ambient DATABASE_URL when no argument is supplied", () => {
    // Pins the default-parameter semantics, so the test above cannot pass by
    // accident again: with a real URL in the environment the predicate must say
    // "configured", and with a placeholder it must still say "unconfigured".
    withoutDatabaseUrl(() => {
      process.env.DATABASE_URL = "postgresql://app:s3cret@db.internal:5432/cios";
      expect(isDbConfigured()).toBe(true);
      process.env.DATABASE_URL =
        "postgresql://placeholder:placeholder@localhost:5432/placeholder";
      expect(isDbConfigured()).toBe(false);
    });
  });

  it("treats the empty values .env.example ships as unconfigured", () => {
    // Copying `.env.example` verbatim must not half-configure anything: every
    // value is empty, and every boot predicate must read empty as "unset".
    const values = new Map(
      [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((match) => [match[1], match[2]]),
    );
    expect(values.get("DATABASE_URL")).toBe("");
    expect(isDbConfigured(values.get("DATABASE_URL"))).toBe(false);
    expect(
      isSupabaseConfigured(
        values.get("NEXT_PUBLIC_SUPABASE_URL"),
        values.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      ),
    ).toBe(false);
    expect(isLlmConfigured({ OPENAI_API_KEY: values.get("OPENAI_API_KEY") })).toBe(false);
  });

  it("keeps both real env files ignored, so nobody 'fixes' this by committing one", () => {
    // A committed `.env` full of placeholders would make a clean clone work and
    // would also risk a real deployment silently running against a fake
    // database. The install path must stay env-free instead.
    const ignored = gitignore.split("\n").map((line) => line.trim());
    expect(ignored).toContain(".env");
    expect(ignored).toContain(".env.local");
    expect(ignored).toContain("!.env.example");
  });
});

describe("the documented quick start is the path that actually works", () => {
  const quickStart = extractCodeBlock(readme, "## Quick start").map(commandOf);

  it("gets from a fresh clone to a running server with install and dev only", () => {
    expect(quickStart).toEqual(["npm ci", "npm run dev"]);
  });

  it("does not tell the user to create an env file first", () => {
    // `npm ci` runs before any env file could exist, so a copy step placed here
    // would be either useless or a lie about what is required.
    for (const line of quickStart) {
      expect(line).not.toMatch(/\.env/);
    }
  });

  it("points at .env rather than .env.local, the only file the Prisma CLI reads", () => {
    expect(envExample).toContain("Copy to `.env`");
    expect(readme).toContain("the Prisma CLI loads only `.env`");
  });

  it("warns that PowerShell 5.1 cannot chain the two commands with &&", () => {
    expect(readme).toContain("PowerShell 5.1");
    expect(readme).toContain("npm ci; npm run dev");
  });
});

describe("the supported Node version is declared, not implied", () => {
  /** jsdom is the strictest declared floor in the dependency tree. */
  const jsdomEngine = (
    JSON.parse(readRepoFile(join("node_modules", "jsdom", "package.json"))) as {
      readonly engines: { readonly node: string };
    }
  ).engines.node;

  it("declares the range the strictest dependency actually needs", () => {
    // Next 16 needs only 20.9 (node_modules/next/dist/docs/01-app/02-guides/
    // upgrading/version-16.md) and `@supabase/supabase-js` needs 22, but on Node
    // 20 the jsdom workers fail to start with
    // "webidl.util.markAsUncloneable is not a function" and nine component test
    // files never run — so jsdom's range is the honest floor. Mirroring it keeps
    // the claim true across a jsdom bump instead of silently going stale.
    expect(packageJson.engines?.node).toBe(jsdomEngine);
  });

  it("states the same range in the README quick start", () => {
    expect(readme).toContain(jsdomEngine);
  });
});

describe("extractCodeBlock", () => {
  it("returns the commands of the first block after the heading, fences excluded", () => {
    const markdown = ["# Title", "", "## Setup", "", "```bash", "one", "", "two", "```", ""].join(
      "\n",
    );
    expect(extractCodeBlock(markdown, "## Setup")).toEqual(["one", "two"]);
  });
});
