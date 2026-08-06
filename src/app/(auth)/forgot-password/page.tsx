"use client";

/**
 * Password-reset request.
 *
 * Sends a Supabase recovery email pointing at `/reset-password`. The success state
 * is deliberately identical whether or not the address exists — confirming which
 * emails are registered is an account-enumeration leak.
 */

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useT } from "@/components/providers/locale-provider";

import { SupabaseNotice } from "../_components/supabase-notice";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  const t = useT();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    if (!EMAIL_PATTERN.test(email.trim())) {
      setFieldError(t("auth.invalidEmail"));
      return;
    }
    if (!configured) {
      setError(t("auth.supabaseNotConfigured"));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("auth.resetPassword")}</CardTitle>
        <CardDescription>{t("auth.forgotPasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SupabaseNotice configured={configured} />

        {error && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {sent ? (
          <Alert className="border-emerald-500/40" data-testid="reset-email-sent">
            <MailCheck className="text-emerald-600" />
            <AlertTitle>{t("auth.checkYourEmail")}</AlertTitle>
            <AlertDescription className="space-y-1 text-xs">
              <p>
                {(() => {
                  const [before, after] = t("auth.resetLinkSent").split("{{email}}");
                  return (
                    <>
                      {before}
                      <strong>{email}</strong>
                      {after}
                    </>
                  );
                })()}
              </p>
              <p>{t("auth.resetLinkSentHint")}</p>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t("auth.placeholder.email")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldError !== null || undefined}
                aria-describedby={fieldError ? "email-error" : undefined}
                required
              />
              {fieldError && (
                <p id="email-error" role="alert" className="text-xs text-destructive">
                  {fieldError}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {t("auth.rememberedIt")}{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            {t("auth.backToSignIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
