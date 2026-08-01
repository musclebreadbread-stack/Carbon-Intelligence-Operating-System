/**
 * Error-boundary classification.
 *
 * Next serialises a Server Component error to the client without its message in
 * production, so a boundary cannot inspect the original `AppError`. What it *can*
 * do is recognise the two cases the user can act on and treat them differently:
 *
 *   - **401 UNAUTHORIZED** — "sign in again"; the session is gone or expired.
 *   - **403 FORBIDDEN** — "ask an administrator"; the session is fine and the
 *     permission is missing. Telling the user to sign in again here would send
 *     them round a loop that cannot succeed.
 *
 * In development the message is forwarded verbatim, which is where the match
 * usually succeeds; in production the digest is all that survives, so the
 * boundary falls back to the generic case and the digest is displayed for
 * correlation with the server log.
 *
 * Pure — no framework imports, so it is directly unit-testable.
 */

export const BOUNDARY_KINDS = ["unauthorized", "forbidden", "notFound", "unknown"] as const;
export type BoundaryKind = (typeof BOUNDARY_KINDS)[number];

export type BoundaryCopy = {
  readonly kind: BoundaryKind;
  readonly title: string;
  readonly description: string;
  /** Where a recovery link should point, or `null` when retry is the only option. */
  readonly actionHref: string | null;
  readonly actionLabel: string | null;
  readonly retryable: boolean;
};

export function classifyBoundaryError(error: { readonly message?: string }): BoundaryKind {
  const message = error.message ?? "";
  if (/\bFORBIDDEN\b/i.test(message) || /do not have permission/i.test(message)) {
    return "forbidden";
  }
  if (
    /\bUNAUTHORIZED\b/i.test(message) ||
    /sign in to continue/i.test(message) ||
    /has been deactivated/i.test(message)
  ) {
    return "unauthorized";
  }
  if (/\bNOT_FOUND\b/i.test(message) || /was not found/i.test(message)) {
    return "notFound";
  }
  return "unknown";
}

/** Copy for a boundary, keyed on the classification. */
export function boundaryCopy(
  error: { readonly message?: string },
  segment?: string,
): BoundaryCopy {
  const kind = classifyBoundaryError(error);
  const where = segment ? ` in ${segment}` : "";
  switch (kind) {
    case "unauthorized":
      return {
        kind,
        title: "Your session has ended",
        description:
          "Sign in again to continue. Nothing was lost — this screen only reads data.",
        actionHref: "/login",
        actionLabel: "Sign in",
        retryable: false,
      };
    case "forbidden":
      return {
        kind,
        title: "You do not have access to this",
        description:
          "Your account is signed in but lacks the permission this screen needs. Ask an administrator to grant it on the Security page.",
        actionHref: "/security",
        actionLabel: "View roles and permissions",
        retryable: false,
      };
    case "notFound":
      return {
        kind,
        title: "That record is gone",
        description:
          "The record this screen was reading no longer exists. Go back to the module index and pick another.",
        actionHref: null,
        actionLabel: null,
        retryable: true,
      };
    default:
      return {
        kind,
        title: `Something went wrong${where}`,
        description:
          "The screen could not be rendered. Retrying re-reads the data; if it keeps failing, the server log carries the matching error digest.",
        actionHref: null,
        actionLabel: null,
        retryable: true,
      };
  }
}
