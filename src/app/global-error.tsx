"use client";

/**
 * Last-resort boundary: replaces the root layout when it is the root layout itself
 * that failed, so it must render its own `<html>` and `<body>`.
 *
 * Per the bundled Next docs this file does not receive the application's global
 * stylesheet, so the styling here is inline rather than Tailwind — a broken theme
 * must not also mean an unreadable error page. `metadata` is unavailable in a
 * client component, hence the React `<title>` element.
 */

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <title>CIOS — unexpected error</title>
        <main style={{ maxWidth: "36rem", padding: "1.5rem", lineHeight: 1.6 }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
            The application failed to start
          </h1>
          <p style={{ margin: "0 0 1rem", opacity: 0.8 }}>
            An error escaped the root layout, so no part of the interface could be
            rendered. Retrying re-runs the request; if it keeps failing, the server log
            carries the matching error digest.
          </p>
          {error.digest && (
            <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", opacity: 0.7 }}>
              Error digest: <code>{error.digest}</code>
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                cursor: "pointer",
                borderRadius: "0.5rem",
                border: "1px solid currentColor",
                background: "transparent",
                padding: "0.375rem 0.75rem",
                font: "inherit",
                fontSize: "0.875rem",
              }}
            >
              Try again
            </button>
            <a
              href="/login"
              style={{
                borderRadius: "0.5rem",
                border: "1px solid currentColor",
                padding: "0.375rem 0.75rem",
                fontSize: "0.875rem",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Go to sign in
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
