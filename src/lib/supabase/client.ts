import { createBrowserClient } from "@supabase/ssr";

/**
 * True when a real Supabase project is configured.
 *
 * Duplicated deliberately from `src/lib/auth/session.ts`: that module reaches into
 * the repositories (and therefore Prisma), so it can never be imported by a client
 * component. This copy reads only the two `NEXT_PUBLIC_` variables, which are the
 * only ones a browser can see anyway.
 *
 * Without this check the auth pages call Supabase with an empty URL and the user
 * sees a raw `fetch failed` / `Invalid URL` error instead of being told the
 * deployment has no identity provider yet.
 */
export function isSupabaseConfigured(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): boolean {
  if (!url || !key) return false;
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();
  if (!/^https?:\/\//.test(trimmedUrl)) return false;
  if (trimmedKey.length === 0 || trimmedKey.toLowerCase().includes("placeholder")) return false;
  return !trimmedUrl.toLowerCase().includes("placeholder");
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
}
