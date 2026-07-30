"use client";

/**
 * Demo-mode notice (decision 5).
 *
 * With no database, no Supabase project and no OpenAI key, the fixtures in
 * `src/lib/data/demo/` are fed through the *real* domain engines, so every figure
 * on screen is genuinely computed — only persistence and generative narrative are
 * stubbed. This banner says that explicitly rather than letting the user assume the
 * numbers are invented, and points at the Korean setup guide for the credentials
 * they have to provision themselves.
 *
 * A client component so it can be dismissed for the session; it is rendered by the
 * server layout, which is what decides whether it appears at all.
 */

import * as React from "react";
import { AlertTriangle, Database, KeyRound, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type DemoModeBannerProps = {
  /** `false` when a database is reachable — the banner renders nothing. */
  readonly demoMode: boolean;
  readonly databaseConfigured: boolean;
  readonly supabaseConfigured: boolean;
  readonly llmConfigured: boolean;
  /** Why the data layer fell back, as reported by `getFallbackReason()`. */
  readonly reason?: string | null;
  readonly className?: string;
};

export function DemoModeBanner({
  demoMode,
  databaseConfigured,
  supabaseConfigured,
  llmConfigured,
  reason,
  className,
}: DemoModeBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (!demoMode || dismissed) return null;

  const missing = [
    !databaseConfigured
      ? { icon: Database, label: "DATABASE_URL", detail: "no PostgreSQL — writes are refused" }
      : null,
    !supabaseConfigured
      ? {
          icon: KeyRound,
          label: "NEXT_PUBLIC_SUPABASE_URL",
          detail: "no identity provider — a demo administrator session is used",
        }
      : null,
    !llmConfigured
      ? {
          icon: Sparkles,
          label: "OPENAI_API_KEY",
          detail: "narrative text is generated deterministically",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div
      data-testid="demo-mode-banner"
      role="status"
      className={cn(
        "rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              Demo mode — every figure below is computed, nothing is saved
            </p>
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-100">
              데모 모드
            </Badge>
          </div>
          <p className="text-xs leading-relaxed">
            No database is reachable, so the bundled sample dataset is running through the
            real calculation engines: the inventory, targets, scenarios and finance numbers
            on every page are the engines&apos; own output. Mutations return{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">DEMO_MODE</code>{" "}
            instead of pretending to save.
          </p>
          <p className="text-xs leading-relaxed">
            데이터베이스가 연결되지 않아 내장 샘플 데이터를 실제 계산 엔진으로 계산해
            표시하고 있습니다. 저장은 되지 않습니다. 직접 설정해야 하는 항목은{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">
              {SETUP_GUIDE_PATH}
            </code>{" "}
            문서를 참고하세요.
          </p>
          {missing.length > 0 && (
            <ul className="grid gap-1 text-xs sm:grid-cols-3">
              {missing.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label} className="flex items-start gap-1.5">
                    <Icon className="mt-0.5 size-3 shrink-0" />
                    <span>
                      <code className="font-medium">{item.label}</code> — {item.detail}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {reason && (
            <p className="text-xs opacity-80">
              Data layer reported: <span className="font-mono">{reason}</span>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss demo mode notice"
          onClick={() => setDismissed(true)}
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
