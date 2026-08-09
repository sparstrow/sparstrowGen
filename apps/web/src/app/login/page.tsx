"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@web/utils/supabase/client";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Label } from "@sparstrow/ui/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@sparstrow/ui/components/ui/card";
import { Badge } from "@sparstrow/ui/components/ui/badge";
import { Separator } from "@sparstrow/ui/components/ui/separator";
import { Shield, Sparkles, ArrowRight, Loader2, KeyRound, Mail, CheckCircle2, AlertCircle } from "lucide-react";

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isMagicLink, setIsMagicLink] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = createClient();

  const handleOAuthSignIn = async (provider: "github" | "google") => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message || `Failed to initiate ${provider} authentication.`,
      });
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setMessage(null);

    try {
      if (isMagicLink) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setMessage({
          type: "success",
          text: "Magic link dispatched! Check your email inbox to log in.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message || "Authentication failed. Please verify credentials.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground relative overflow-hidden px-4">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      {/* Main Login Card Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-mono tracking-wider border border-border">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <span>SPARSTROW OS / STAGING AUTH</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">
            Sparstrowgen
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Autonomous multi-agent runtime & control plane
          </p>
        </div>

        {/* Auth Form Card */}
        <Card className="border-border bg-card shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold tracking-tight">
                Welcome Back
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                Staging
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Sign in with your GitHub, Google, or email account.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {message && (
              <div
                className={`p-3 rounded-md text-xs flex items-start gap-2 border transition-all duration-200 ${
                  message.type === "success"
                    ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <span>{message.text}</span>
              </div>
            )}

            {/* OAuth Provider Buttons with 44px (h-11) touch targets */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => handleOAuthSignIn("github")}
                className="w-full border-border bg-background hover:bg-accent text-xs h-11 font-medium transition-all duration-150 active:scale-[0.98]"
              >
                <GithubIcon className="mr-2 h-4 w-4 shrink-0" />
                GitHub
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => handleOAuthSignIn("google")}
                className="w-full border-border bg-background hover:bg-accent text-xs h-11 font-medium transition-all duration-150 active:scale-[0.98]"
              >
                <GoogleIcon className="mr-2 h-4 w-4 shrink-0" />
                Google
              </Button>
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-card px-2 text-muted-foreground font-mono">
                  Or Continue With Email
                </span>
              </div>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">
                  Work Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="developer@sparstrow.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="pl-9 bg-background border-input text-sm h-11"
                  />
                </div>
              </div>

              {!isMagicLink && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium">
                      Password
                    </Label>
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="pl-9 bg-background border-input text-sm h-11"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-11 transition-all duration-150 active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    {isMagicLink ? "Send Magic Link" : "Sign In with Password"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsMagicLink(!isMagicLink);
                setMessage(null);
              }}
              className="w-full text-xs h-9 text-muted-foreground hover:text-foreground transition-colors"
            >
              {isMagicLink ? (
                <>
                  <KeyRound className="mr-2 h-3.5 w-3.5" />
                  Switch to Password Auth
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Switch to Magic Link
                </>
              )}
            </Button>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border pt-3">
            <p className="text-[11px] text-muted-foreground text-center font-mono">
              Protected by Staging Supabase Auth & Session Guard
            </p>
          </CardFooter>
        </Card>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground">
          Need access? Request staging credentials from your workspace admin.
        </p>
      </div>
    </div>
  );
}
