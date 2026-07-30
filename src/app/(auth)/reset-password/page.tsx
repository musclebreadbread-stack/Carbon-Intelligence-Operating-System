"use client";

/**
 * Set a new password.
 *
 * Reached from the recovery link, which Supabase exchanges for a short-lived
 * session before this page renders. The page therefore checks that a session
 * actually exists: without one, `updateUser` would fail with an opaque error, and
 * the useful thing to say is "the link expired, request another".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LinkIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/shared/link-button";
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

import { SupabaseNotice } from "../_components/supabase-notice";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const configured = isSupabaseConfigured();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // `null` means "still checking"; with Supabase unconfigured there is nothing to
  // check, so the initial value is already the answer and the effect does nothing.
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(
    configured ? null : false,
  );

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setHasRecoverySession(data.session !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPasswordError(null);
    setConfirmationError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmation) {
      setConfirmationError("The two passwords do not match");
      return;
    }
    if (!configured) {
      setError("Supabase가 구성되지 않아 비밀번호를 변경할 수 없습니다.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    setDone(true);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>
          At least {MIN_PASSWORD_LENGTH} characters. You will stay signed in on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SupabaseNotice configured={configured} />

        {configured && hasRecoverySession === false && (
          <Alert variant="destructive" data-testid="no-recovery-session">
            <LinkIcon />
            <AlertTitle>This reset link is no longer valid</AlertTitle>
            <AlertDescription className="space-y-2 text-xs">
              <p>
                Recovery links sign you in for a short window and expire after one hour. Request a
                new one and open it from the same browser.
              </p>
              <LinkButton size="sm" variant="outline" href="/forgot-password">
                Request a new link
              </LinkButton>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {done ? (
          <Alert className="border-emerald-500/40" data-testid="password-updated">
            <CheckCircle2 className="text-emerald-600" />
            <AlertTitle>Password updated</AlertTitle>
            <AlertDescription className="space-y-2 text-xs">
              <p>Use the new password next time you sign in.</p>
              <Button
                size="sm"
                onClick={() => {
                  router.push("/dashboard");
                  router.refresh();
                }}
              >
                Go to the dashboard
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={passwordError !== null || undefined}
                aria-describedby={passwordError ? "password-error" : undefined}
                required
              />
              {passwordError && (
                <p id="password-error" role="alert" className="text-xs text-destructive">
                  {passwordError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmation">Confirm new password</Label>
              <Input
                id="confirmation"
                name="confirmation"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-invalid={confirmationError !== null || undefined}
                aria-describedby={confirmationError ? "confirmation-error" : undefined}
                required
              />
              {confirmationError && (
                <p id="confirmation-error" role="alert" className="text-xs text-destructive">
                  {confirmationError}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
