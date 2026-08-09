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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isMagicLink, setIsMagicLink] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = createClient();

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
                {isMagicLink ? "Sign In via Magic Link" : "Sign In via Password"}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                Staging
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              {isMagicLink
                ? "Enter your email to receive a passwordless login link."
                : "Enter your email and password to access the control plane."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {message && (
              <div
                className={`p-3 rounded-md text-xs flex items-start gap-2 border ${
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

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">
                  Work Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="developer@sparstrow.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="pl-9 bg-background border-input text-sm"
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
                    <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="pl-9 bg-background border-input text-sm"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm h-10"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    {isMagicLink ? "Send Magic Link" : "Sign In"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-card px-2 text-muted-foreground font-mono">
                  Authentication Method
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsMagicLink(!isMagicLink);
                setMessage(null);
              }}
              className="w-full border-border text-xs h-9 hover:bg-accent"
            >
              {isMagicLink ? (
                <>
                  <KeyRound className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  Switch to Email & Password
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  Switch to Passwordless Magic Link
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
