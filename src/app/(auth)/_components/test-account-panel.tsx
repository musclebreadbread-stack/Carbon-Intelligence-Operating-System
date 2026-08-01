"use client";

/**
 * Test account info panel.
 *
 * Shown on the login page when Supabase is not configured. Displays the built-in
 * demo account and states its real scope: no password is needed, and nothing can be
 * saved. The copy used to promise "all features", which was wrong in the only mode
 * this panel appears in — every mutation is refused with `DEMO_MODE`.
 */

import { UserCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LinkButton } from "@/components/shared/link-button";
import { useT } from "@/components/providers/locale-provider";

export function TestAccountPanel({ configured }: { readonly configured: boolean }) {
  const t = useT();

  if (configured) return null;

  return (
    <Alert className="border-emerald-400/60 bg-emerald-50/50 dark:bg-emerald-950/20" data-testid="test-account-panel">
      <UserCheck className="text-emerald-600" />
      <AlertTitle>{t("testAccount.title")}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {t("testAccount.description")}
        </p>
        <div className="rounded-md border bg-background p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="font-medium">{t("testAccount.email")}:</span>
            <code className="text-emerald-700 dark:text-emerald-400">{t("testAccount.emailValue")}</code>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">{t("testAccount.name")}:</span>
            <span>{t("testAccount.nameValue")}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">{t("testAccount.role")}:</span>
            <span>{t("testAccount.roleValue")}</span>
          </div>
          <div className="pt-1 border-t text-muted-foreground italic">
            {t("testAccount.password")}
          </div>
        </div>
        <LinkButton size="sm" variant="default" href="/dashboard" className="w-full">
          {t("testAccount.cta")}
        </LinkButton>
      </AlertDescription>
    </Alert>
  );
}
