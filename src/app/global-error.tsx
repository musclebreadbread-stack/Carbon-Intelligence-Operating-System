"use client";

/**
 * Last-resort boundary: replaces the root layout when it is the root layout itself
 * that failed, so it must render its own `<html>` and `<body>`.
 *
 * Since this component cannot access server-side locale resolution (it replaces
 * the root layout), it renders hardcoded Korean text directly rather than going
 * through the dictionary system. Per the bundled Next docs this file also does not
 * receive the application's global stylesheet, so the styling here is inline rather
 * than Tailwind — a broken theme must not also mean an unreadable error page.
 * `metadata` is unavailable in a client component, hence the React `<title>` element.
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
        <title>CIOS — 예상치 못한 오류</title>
        <main style={{ maxWidth: "36rem", padding: "1.5rem", lineHeight: 1.6 }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
            애플리케이션을 시작할 수 없습니다
          </h1>
          <p style={{ margin: "0 0 1rem", opacity: 0.8 }}>
            루트 레이아웃에서 오류가 발생하여 인터페이스를 렌더링할 수 없습니다. 다시
            시도하시고, 문제가 지속되면 서버 로그를 확인하세요.
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
              다시 시도
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
              로그인으로 이동
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
