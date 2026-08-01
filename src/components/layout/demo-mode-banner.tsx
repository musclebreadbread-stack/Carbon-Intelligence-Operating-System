"use client";

/**
 * Demo-mode notice (decision 5).
 *
 * Locale-aware: renders Korean by default, English when switched.
 */

import * as React from "react";
import { AlertTriangle, Database, KeyRound, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/providers/locale-provider";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type DemoModeBannerProps = {
  readonly demoMode: boolean;
  readonly databaseConfigured: boolean;
  readonly supabaseConfigured: boolean;
  readonly llmConfigured: boolean;
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
  const t = useT();

  if (!demoMode || dismissed) return null;

  const missing = [
    !databaseConfigured
      ? { icon: Database, label: "DATABASE_URL" }
      : null,
    !supabaseConfigured
      ? { icon: KeyRound, label: "NEXT_PUBLIC_SUPABASE_URL" }
      : null,
    !llmConfigured
      ? { icon: Sparkles, label: "OPENAI_API_KEY" }
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
            <p className="text-sm font-medium">{t("demo.banner")}</p>
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-100">
              {t("demo.banner")}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed">{t("demo.bannerDescription")}</p>
          <p className="text-xs leading-relaxed">
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/60">
              {SETUP_GUIDE_PATH}
            </code>
          </p>
          {missing.length > 0 && (
            <ul className="grid gap-1 text-xs sm:grid-cols-3">
              {missing.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label} className="flex items-start gap-1.5">
                    <Icon className="mt-0.5 size-3 shrink-0" />
                    <code className="font-medium">{item.label}</code>
                  </li>
                );
              })}
            </ul>
          )}
          {reason && (
            <p className="text-xs opacity-80">
              <span className="font-mono">{reason}</span>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("common.close")}
          onClick={() => setDismissed(true)}
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
