"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@web/utils/supabase/client";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Label } from "@sparstrow/ui/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparstrow/ui/components/ui/card";

/**
 * Choose a new password.
 *
 * You arrive here from /auth/confirm, which has already exchanged the emailed
 * recovery token for a real session. So this page does not handle a token at
 * all -- it just calls updateUser on the session it finds. If there is no
 * session the link was expired or already used, and the only useful thing to
 * say is "ask for a new one".
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [checking, setChecking] = React.useState(true);
  const [hasSession, setHasSession] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.user);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    // Sign every other device out. A password reset is what you do when you
    // think somebody else has the old one, so leaving their sessions alive
    // would defeat the point of resetting it.
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a new password</CardTitle>
            <CardDescription>
              {hasSession
                ? "This replaces your old password and signs out your other devices."
                : "This reset link is no longer valid."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {checking ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking your link…
              </div>
            ) : !hasSession ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Reset links expire, and each one works only once. Request a fresh link and
                  use the newest email.
                </p>
                <Button className="w-full" onClick={() => router.push("/login")}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div aria-live="polite">
                  {error ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      autoFocus
                      disabled={pending}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={show ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    disabled={pending}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Update password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
