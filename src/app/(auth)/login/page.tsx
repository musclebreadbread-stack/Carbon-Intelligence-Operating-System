"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useT } from "@/components/providers/locale-provider";
import { CallbackError } from "../_components/callback-error";
import { SupabaseNotice } from "../_components/supabase-notice";
import { TestAccountPanel } from "../_components/test-account-panel";

function isEmailNotConfirmed(error: { code?: string; message: string }): boolean {
  return (
    error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)
  );
}

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsConfirmation(false);

    if (!configured) {
      setError(t("auth.supabaseNotConfigured"));
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      if (isEmailNotConfirmed(authError)) {
        setNeedsConfirmation(true);
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleResendConfirmation() {
    if (!configured || email.trim().length === 0) return;
    setResendState("sending");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
      setResendState("idle");
      return;
    }
    setResendState("sent");
  }

  async function handleOAuthLogin(provider: "google" | "azure") {
    setError(null);
    if (!configured) {
      setError(t("auth.supabaseNotConfigured"));
      return;
    }
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("auth.welcomeBack")}</CardTitle>
        <CardDescription>{t("auth.signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SupabaseNotice configured={configured} />
        <TestAccountPanel configured={configured} />

        <Suspense fallback={null}>
          <CallbackError />
        </Suspense>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {needsConfirmation && (
          <div
            className="space-y-2 rounded-md border border-amber-400/60 p-3 text-sm"
            data-testid="email-not-confirmed"
          >
            <p className="font-medium">{t("auth.emailNotConfirmed")}</p>
            <p className="text-xs text-muted-foreground">
              {t("auth.emailNotConfirmedDescription")}
              {resendState === "sent" && ` ${t("auth.confirmationSent")}`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleResendConfirmation}
              disabled={resendState !== "idle"}
            >
              {resendState === "sending"
                ? t("auth.sending")
                : resendState === "sent"
                  ? t("auth.confirmationSent")
                  : t("auth.resendConfirmation")}
            </Button>
          </div>
        )}

        {/* SSO Buttons */}
        <div className="grid gap-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthLogin("google")}
            disabled={loading}
          >
            <svg className="mr-2 size-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {t("auth.continueWithGoogle")}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthLogin("azure")}
            disabled={loading}
          >
            <svg className="mr-2 size-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
            </svg>
            {t("auth.continueWithMicrosoft")}
          </Button>
        </div>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            {t("auth.orContinueWithEmail")}
          </span>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t("auth.placeholder.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={t("auth.placeholder.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
