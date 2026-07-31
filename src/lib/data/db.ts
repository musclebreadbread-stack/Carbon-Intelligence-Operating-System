/**
 * Database availability gate (decision 5).
 *
 * This project must build, render and compute correctly with no PostgreSQL
 * server reachable. Rather than crashing at render time, every repository read
 * goes through `withDb(query, fallback)`: if Prisma cannot initialise or connect,
 * the fixture dataset in `src/lib/data/demo/` is returned instead and the process
 * is flagged as running in **demo mode**.
 *
 * The fixtures feed the *real* domain engines, so every number the UI shows is
 * genuinely computed — only persistence is stubbed. Mutations are refused in demo
 * mode (`ActionState` with `code: 'DEMO_MODE'`) rather than silently discarded.
 */

export type DataMode = "database" | "demo";

/**
 * Prisma connection/initialisation error codes that mean "no reachable
 * database", as opposed to a query the caller got wrong.
 *
 *   P1000 authentication failed
 *   P1001 cannot reach the database server
 *   P1002 the server was reached but timed out
 *   P1003 the database does not exist
 *   P1017 the server has closed the connection
 */
export const DB_UNAVAILABLE_CODES = ["P1000", "P1001", "P1002", "P1003", "P1017"] as const;

/**
 * `DATABASE_URL` values that ship in `.env.local` as placeholders. Treating these
 * as "unconfigured" is what lets `npm run build` and `npm test` pass on a clean
 * checkout.
 */
const PLACEHOLDER_URL_MARKERS = [
  "placeholder",
  "username:password",
  "user:password",
  "changeme",
  "your-",
  "<",
] as const;

let currentMode: DataMode = "database";
/** Reason the process fell back, surfaced by the demo-mode banner. */
let fallbackReason: string | null = null;

/** True when `DATABASE_URL` is present and is not an obvious placeholder. */
export function isDbConfigured(url: string | undefined = process.env.DATABASE_URL): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  if (!/^(postgres|postgresql|prisma):\/\//i.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_URL_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Why `DATABASE_URL` cannot be used, or `null` when it can be.
 *
 * The single source of this wording: `withDb`, `canWrite` and `GET /api/v1/health`
 * all report it, and they must not drift. Deliberately side-effect free — a health
 * check has to be able to describe the configuration without flipping the process
 * into demo mode as a side effect of being asked.
 */
export function dbUnconfiguredReason(
  url: string | undefined = process.env.DATABASE_URL,
): string | null {
  if (isDbConfigured(url)) return null;
  const present = typeof url === "string" && url.trim().length > 0;
  return present ? "DATABASE_URL is a placeholder value" : "DATABASE_URL is not set";
}

/** Extracts a Prisma error code from an unknown throwable. */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function errorName(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown database error";
}

/**
 * True when the throwable means the database is unreachable or unconfigured, as
 * opposed to a bad query the caller should see. `PrismaClientInitializationError`
 * is matched by name so this module never has to import `@prisma/client`.
 */
export function isDbUnavailableError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && (DB_UNAVAILABLE_CODES as readonly string[]).includes(code)) return true;

  const name = errorName(error);
  if (name === "PrismaClientInitializationError") return true;
  if (name === "PrismaClientRustPanicError") return true;

  const message = errorMessage(error);
  return (
    /environment variable not found: DATABASE_URL/i.test(message) ||
    /Can't reach database server/i.test(message) ||
    /the URL must start with the protocol/i.test(message) ||
    /Error validating datasource/i.test(message)
  );
}

/** The mode the process is currently serving reads from. */
export function getDataMode(): DataMode {
  return currentMode;
}

export function isDemoMode(): boolean {
  return currentMode === "demo";
}

/** Why the process fell back to fixtures; `null` while running on a database. */
export function getFallbackReason(): string | null {
  return fallbackReason;
}

/** Test-only: restores the initial state between cases. */
export function resetDataMode(): void {
  currentMode = "database";
  fallbackReason = null;
}

function enterDemoMode(reason: string): void {
  currentMode = "demo";
  fallbackReason = reason;
}

/**
 * Runs `query` against the database, falling back to `fallback` when the database
 * is unconfigured or unreachable.
 *
 * `fallback` is a thunk so the fixture graph is only materialised when it is
 * actually needed. Errors that are *not* connection failures propagate — a
 * malformed query must not be masked as "no database".
 */
export async function withDb<T>(query: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  const unconfigured = dbUnconfiguredReason();
  if (unconfigured !== null) {
    enterDemoMode(unconfigured);
    return fallback();
  }
  try {
    const result = await query();
    // A previously failed connection that now succeeds returns the process to
    // database mode, so a transient outage does not pin the app to fixtures.
    currentMode = "database";
    fallbackReason = null;
    return result;
  } catch (error) {
    if (!isDbUnavailableError(error)) throw error;
    enterDemoMode(errorMessage(error));
    return fallback();
  }
}

/**
 * Mutation guard. Returns `false` when the database is unavailable, so an action
 * can report `DEMO_MODE` instead of pretending a write succeeded.
 */
export async function canWrite(): Promise<boolean> {
  const unconfigured = dbUnconfiguredReason();
  if (unconfigured !== null) {
    enterDemoMode(unconfigured);
    return false;
  }
  return true;
}
