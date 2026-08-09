"use client";

import React, { useState } from "react";
import { createClient } from "@web/utils/supabase/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@sparstrow/ui/components/ui/card";
import { Button } from "@sparstrow/ui/components/ui/button";
import { Input } from "@sparstrow/ui/components/ui/input";
import { Label } from "@sparstrow/ui/components/ui/label";
import { Separator } from "@sparstrow/ui/components/ui/separator";

// Instantiate browser Supabase client once statically outside component render body
const supabase = createClient();

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordMode, setIsPasswordMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Magic link sent! Check your inbox." });
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      window.location.href = "/";
    }
  };

  const handleOAuthSignIn = async (provider: "github" | "google") => {
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setLoading(false);
      setMessage({ type: "error", text: error.message });
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-background px-4 py-12 text-foreground">
      {/* Ambient background glow & subtle dot grid */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-muted/20 via-background to-background pointer-events-none" />
      
      <Card className="relative z-10 w-full max-w-sm sm:max-w-md border-border/80 bg-card/95 p-6 shadow-2xl backdrop-blur-md">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="space-y-1">
            <CardTitle as="h1" className="text-2xl font-bold tracking-tight text-foreground">
              Welcome to Sparstrowgen
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Sign in to your AI agent workspace
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {message && (
            <div
              role="alert"
              aria-live="polite"
              className={`rounded-lg p-3 text-sm font-medium border ${
                message.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={loading}
              onClick={() => handleOAuthSignIn("github")}
              className="w-full justify-center gap-2.5 font-medium hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Continue with GitHub
            </Button>

            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={loading}
              onClick={() => handleOAuthSignIn("google")}
              className="w-full justify-center gap-2.5 font-medium hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.27v3.15C3.25 21.28 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l4.01-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.72 1.27 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.72-4.96z"
                />
              </svg>
              Continue with Google
            </Button>
          </div>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2.5 text-muted-foreground font-mono text-[11px] tracking-wider">
                Or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={isPasswordMode ? handlePasswordSignIn : handleMagicLink} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-muted/30 border-input text-foreground focus:bg-background transition-colors"
              />
            </div>

            {isPasswordMode && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-muted/30 border-input text-foreground focus:bg-background transition-colors"
                />
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full font-semibold shadow-sm">
              {loading ? "Processing..." : isPasswordMode ? "Sign In" : "Send Magic Link"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-border/80 pt-4 mt-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setIsPasswordMode(!isPasswordMode)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isPasswordMode ? "Use Magic Link instead" : "Use Password sign-in instead"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
