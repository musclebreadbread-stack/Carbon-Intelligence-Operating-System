"use client";

/**
 * "Supabase is not configured" notice.
 *
 * Shown on every auth page when `NEXT_PUBLIC_SUPABASE_URL` /
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent or placeholders. Without it, every
 * form on these pages fails with a raw network error, which tells the operator
 * nothing about the actual problem.
 *
 * The copy is Korean plus English: per the plan, user-facing *configuration*
 * notices are Korean while the rest of the UI stays English.
 */

import { KeyRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkButton } from "@/components/shared/link-button";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";

export function SupabaseNotice({ configured }: { readonly configured: boolean }) {
  if (configured) return null;

  return (
    <Alert className="border-amber-400/60" data-testid="supabase-not-configured">
      <KeyRound className="text-amber-600" />
      <AlertTitle>Supabase가 구성되지 않았습니다</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-xs">
          인증 공급자가 설정되지 않아 로그인·회원가입·비밀번호 재설정을 사용할 수 없습니다.{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> 와{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 설정한 뒤 다시 시도하세요. 설정
          절차는 <code>{SETUP_GUIDE_PATH}</code> 문서에 있습니다.
        </p>
        <p className="text-xs">
          Sign-in is unavailable because no identity provider is configured. The application is
          still fully navigable: a demo administrator session is used and every figure is
          computed from the bundled sample data.
        </p>
        <LinkButton size="sm" variant="outline" href="/dashboard">
          Continue to the demo dashboard
        </LinkButton>
      </AlertDescription>
    </Alert>
  );
}
