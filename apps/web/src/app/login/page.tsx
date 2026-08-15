"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Wand2,
} from "lucide-react";
import { createClient } from "@web/utils/supabase/client";
import { safeRedirectPath } from "@web/lib/auth/redirect";
import {
  fetchProviderAvailability,
  type ProviderAvailability,
} from "@web/lib/auth/providers";
import { supabaseAnonKey, supabaseUrl } from "@web/utils/supabase/env";
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
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { cn } from "@sparstrow/ui/lib/utils";
import { GithubIcon, GoogleIcon } from "@web/components/auth/provider-icons";

type Mode = "sign-in" | "sign-up" | "forgot" | "magic-link";
type Notice = { tone: "error" | "success"; text: string };

/** Modes that ask only for an email address -- no password field. */
const EMAIL_ONLY: ReadonlySet<Mode> = new Set<Mode>(["forgot", "magic-link"]);

const COPY: Record<Mode, { title: string; description: string; submit: string }> = {
  "sign-in": {
    title: "Sign in",
    description: "Use your Sparstrow account to reach this workspace.",
    submit: "Sign in",
  },
  "sign-up": {
    title: "Create an account",
    description: "You'll get your own workspace, ready to pair a machine to.",
    submit: "Create account",
  },
  forgot: {
    title: "Reset your password",
    description: "We'll email you a link to choose a new one.",
    submit: "Send reset link",
  },
  "magic-link": {
    title: "Sign in with a link",
    description: "We'll email you a link that signs you in. No password needed.",
    submit: "Email me a link",
  },
};

/**
 * Turn Supabase's auth errors into something a person can act on.
 *
 * Two of these matter enough to special-case. "Provider is not enabled" is
 * what every OAuth button returns until the provider is configured in the
 * dashboard, and the raw text gives no hint that the fix is a setting rather
 * than a bug. "Invalid login credentials" is deliberately vague on Supabase's
 * side -- it does not say whether the account exists, which is correct, and we
 * keep it that way rather than helpfully confirming which emails are
 * registered.
 */
function humanize(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("not enabled") || m.includes("unsupported provider")) {
    return "That sign-in provider isn't enabled for this project yet. Use email and password, or ask an admin to finish the provider setup.";
  }
  if (m.includes("invalid login credentials")) {
    return "That email and password combination didn't work.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a couple of minutes and try again.";
  }
  if (m.includes("pwned") || m.includes("compromised") || m.includes("data breach")) {
    return "That password has appeared in a known data breach. Please choose a different one.";
  }
  if (m.includes("password should be")) {
    // Supabase's own text already names the exact requirement.
    return message;
  }
  return message;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = React.useMemo(() => createClient(), []);

  const next = safeRedirectPath(searchParams.get("next"));

  const [mode, setMode] = React.useState<Mode>("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [pending, setPending] = React.useState<null | "email" | "github" | "google">(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  // The callback and confirm routes report failures by bouncing back here with
  // ?error=. Surface it once, then strip it from the URL so a refresh does not
  // resurrect a message about something that already happened.
  const urlError = searchParams.get("error");
  React.useEffect(() => {
    if (!urlError) return;
    setNotice({ tone: "error", text: humanize(urlError) });
    router.replace(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  }, [urlError, router, next]);

  // null means "not known yet" -- the buttons stay enabled in that case, so a
  // slow or blocked settings request never hides a provider that works.
  const [providers, setProviders] = React.useState<ProviderAvailability | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    void fetchProviderAvailability(supabaseUrl(), supabaseAnonKey(), controller.signal).then(
      (result) => {
        if (result) setProviders(result);
      },
    );
    return () => controller.abort();
  }, []);

  const busy = pending !== null;
  const copy = COPY[mode];
  const anyProviderOff = providers !== null && (!providers.github || !providers.google);

  function switchTo(target: Mode) {
    setMode(target);
    setNotice(null);
    if (target !== "sign-in") setShowPassword(false);
  }

  async function signInWithProvider(provider: "github" | "google") {
    // Guard before navigating. Once the browser leaves for Supabase's
    // /authorize endpoint there is no coming back to show a message here.
    if (providers && !providers[provider]) {
      setNotice({ tone: "error", text: humanize("provider is not enabled") });
      return;
    }

    setPending(provider);
    setNotice(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser is already navigating away, so only the failure
    // path ever reaches this line.
    if (error) {
      setNotice({ tone: "error", text: humanize(error.message) });
      setPending(null);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending("email");
    setNotice(null);

    try {
      if (mode === "magic-link") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
            // Without this, signInWithOtp CREATES an account for any address
            // typed here -- so the sign-in form would quietly become an open
            // signup form. Explicit account creation stays on the sign-up tab.
            shouldCreateUser: false,
          },
        });
        // Swallow the error deliberately. With shouldCreateUser false,
        // Supabase answers "signups not allowed for otp" for an address that
        // has no account -- which would turn this box into a way to test
        // whether any given person has one. Same generic answer either way;
        // the only thing that distinguishes them is whether an email arrives.
        if (error && !/signup|not allowed|not found/i.test(error.message)) throw error;
        // The second sentence is the whole point. The generic answer above is
        // correct security but it is indistinguishable from a successful send,
        // so someone with no account waits for an email that was never sent --
        // which is exactly how this failed in practice. Saying it generically
        // helps that person without revealing anything about THIS address.
        setNotice({
          tone: "success",
          text: `If an account exists for ${email}, a sign-in link is on its way. It works once and expires in an hour. No account yet? Nothing is sent until you create one — use "Create an account" below.`,
        });
        return;
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/auth/reset-password`,
        });
        if (error) throw error;
        // Deliberately unconditional: saying "no account with that email"
        // turns this form into a way to enumerate who has an account here.
        setNotice({
          tone: "success",
          text: "If an account exists for that address, a reset link is on its way. No account yet? Nothing is sent until you create one.",
        });
        return;
      }

      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;

        // Whether a session comes back depends on the project's confirmation
        // setting, so read the response instead of assuming. Telling someone
        // to check their inbox when they are already signed in leaves them
        // waiting for an email that will never arrive.
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setNotice({
            tone: "success",
            text: "Account created. Check your inbox for a confirmation link to finish signing in.",
          });
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      setNotice({
        tone: "error",
        text: humanize(err instanceof Error ? err.message : "Something went wrong. Try again."),
      });
    } finally {
      setPending(null);
    }
  }

  const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center flex flex-col items-center">
          <Image src="/logo.png" alt="Sparstrowgen Logo" width={64} height={64} className="mb-2" />
          <h1 className="text-xl font-semibold tracking-tight">Sparstrowgen</h1>
          <p className="text-sm text-muted-foreground">
            Autonomous multi-agent runtime &amp; control plane
          </p>
          {envLabel ? (
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              {envLabel}
            </Badge>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* aria-live so a screen reader announces the result of a submit;
                without it the only feedback is visual and the form looks
                inert after a failed sign-in. */}
            <div aria-live="polite">
              {notice ? (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-3 text-sm",
                    notice.tone === "error"
                      ? "border-destructive/30 text-destructive"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {notice.tone === "error" ? (
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span>{notice.text}</span>
                </div>
              ) : null}
            </div>

            {!EMAIL_ONLY.has(mode) ? (
              <>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || providers?.github === false}
                      title={
                        providers?.github === false
                          ? "GitHub sign-in is not configured for this project yet."
                          : undefined
                      }
                      onClick={() => void signInWithProvider("github")}
                    >
                      {pending === "github" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <GithubIcon className="size-4" />
                      )}
                      GitHub
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || providers?.google === false}
                      title={
                        providers?.google === false
                          ? "Google sign-in is not configured for this project yet."
                          : undefined
                      }
                      onClick={() => void signInWithProvider("google")}
                    >
                      {pending === "google" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <GoogleIcon className="size-4" />
                      )}
                      Google
                    </Button>
                  </div>
                  {anyProviderOff ? (
                    <p className="text-center text-xs text-muted-foreground">
                      {providers && !providers.github && !providers.google
                        ? "Social sign-in isn't set up yet — use email below."
                        : `${providers?.github ? "Google" : "GitHub"} sign-in isn't set up yet.`}
                    </p>
                  ) : null}
                </div>

                <div className="relative text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                  <span className="relative z-10 bg-card px-2 text-muted-foreground">
                    or continue with email
                  </span>
                </div>
              </>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  disabled={busy}
                />
              </div>

              {!EMAIL_ONLY.has(mode) ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "sign-in" ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        onClick={() => switchTo("forgot")}
                      >
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                      // Supabase's own minimum. Enforcing it here means the
                      // browser catches it before a round trip.
                      minLength={mode === "sign-up" ? 6 : undefined}
                      required
                      disabled={busy}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {mode === "sign-up" ? (
                    // Do NOT promise breach screening here. It needs a paid
                    // Supabase plan and is off, so the old copy told people
                    // their password had been checked when nothing checked it.
                    <p className="text-xs text-muted-foreground">
                      At least 6 characters. Choose one you don&apos;t reuse elsewhere.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {pending === "email" ? <Loader2 className="size-4 animate-spin" /> : null}
                {copy.submit}
              </Button>

              {mode === "sign-in" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={busy}
                  onClick={() => switchTo("magic-link")}
                >
                  <Wand2 className="size-4" />
                  Email me a sign-in link instead
                </Button>
              ) : null}

              {mode === "magic-link" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={busy}
                  onClick={() => switchTo("sign-in")}
                >
                  <KeyRound className="size-4" />
                  Use a password instead
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-foreground underline underline-offset-4"
                onClick={() => switchTo("sign-up")}
              >
                Create one
              </button>
            </>
          ) : mode === "magic-link" ? (
            // Getting BACK to sign-in is already covered by "Use a password
            // instead" in the form. Getting to sign-UP was not covered at all,
            // which left the one person who needs it most -- no account, so no
            // link will ever arrive -- with no way out of this mode.
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-foreground underline underline-offset-4"
                onClick={() => switchTo("sign-up")}
              >
                Create an account
              </button>
            </>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => switchTo("sign-in")}
            >
              <ArrowLeft className="size-3.5" />
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary of its own, or the whole route
  // opts out of static rendering and Next fails the production build.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
