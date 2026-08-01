"use client";

/**
 * Last-resort boundary: replaces the root layout when it is the root layout itself
 * that failed, so it must render its own `<html>` and `<body>`.
 *
 * Since this component cannot access server-side locale resolution (it replaces
 * the root layout), it renders both Korean and English text to ensure the user
 * can understand the error regardless of preference.
 */

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
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
        <title>CIOS - {"\uC608\uC0C1\uCE58 \uBABB\uD55C \uC624\uB958"}</title>
        <main style={{ maxWidth: "36rem", padding: "1.5rem", lineHeight: 1.6 }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
            {"\uC560\uD50C\uB9AC\uCF00\uC774\uC158\uC744 \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}
          </h1>
          <p style={{ margin: "0 0 1rem", opacity: 0.8 }}>
            {"\uB8E8\uD2B8 \uB808\uC774\uC544\uC6C3\uC5D0\uC11C \uC624\uB958\uAC00 \uBC1C\uC0DD\uD558\uC5EC \uC778\uD130\uD398\uC774\uC2A4\uB97C \uB80C\uB354\uB9C1\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC2DC\uACE0, \uBB38\uC81C\uAC00 \uC9C0\uC18D\uB418\uBA74 \uC11C\uBC84 \uB85C\uADF8\uB97C \uD655\uC778\uD558\uC138\uC694."}
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
              {"\uB2E4\uC2DC \uC2DC\uB3C4"}
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
              {"\uB85C\uADF8\uC778\uC73C\uB85C \uC774\uB3D9"}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
