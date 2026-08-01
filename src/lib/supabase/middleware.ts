import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isDbConfigured } from "@/lib/data/db";

import { isSupabaseConfigured } from "./client";

/** Paths reachable without a session. */
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  // Health is deliberately unauthenticated: "is this deployment misconfigured?"
  // has to be answerable before any credential exists.
  "/api/v1/health",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  // With no Supabase project there is no identity provider to authenticate
  // against, and `getUser()` would report "no user" for everyone — redirecting
  // every route to a sign-in page that cannot work. Demo mode is explicitly
  // navigable (decision 5) and `getSession()` supplies the read-only demo
  // administrator, so route protection is skipped **only** in that mode.
  //
  // A real `DATABASE_URL` with missing Supabase credentials is a different
  // deployment entirely: `canWrite()` would allow writes while nobody had
  // authenticated, which turned every server action into an anonymous
  // administrator API. That combination is a configuration error, so it fails
  // closed here and `getSession()` refuses to mint a demo session for it.
  // Redirecting to `/login` is not an option — the login form needs the same
  // Supabase project that is missing — so the misconfiguration is stated instead.
  if (!isSupabaseConfigured()) {
    if (!isDbConfigured() || isPublicPath) return supabaseResponse;
    return NextResponse.json(
      {
        error: "AUTH_NOT_CONFIGURED",
        message:
          "This deployment has a database but no identity provider. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or unset DATABASE_URL to run the read-only demo.",
        messageKo:
          "데이터베이스는 구성되었으나 인증 공급자가 없습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하거나, 읽기 전용 데모로 실행하려면 DATABASE_URL을 해제하세요.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    // No user on a protected route, redirect to login page
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
