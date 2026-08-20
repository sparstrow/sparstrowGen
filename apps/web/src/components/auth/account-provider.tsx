"use client";

import * as React from "react";
import { createClient } from "@web/utils/supabase/client";
import { AccountProvider, type Account } from "@sparstrow/ui/lib/account";
import { ImageUploaderProvider } from "@sparstrow/ui/lib/image-upload";
import { toSnapshot, type AccountSnapshot } from "@web/lib/auth/account-snapshot";
import { createSupabaseImageUploader } from "@web/lib/storage/image-uploader";

/**
 * Feeds the shared shell's account context from the Supabase session.
 *
 * `initial` comes from the server (see app/layout.tsx) and is not an
 * optimisation -- it is what makes the markup match. Deriving the account only
 * in an effect meant the server rendered "Local workspace" while the client's
 * first render already had the email, and React aborted hydration of the whole
 * shell with a mismatch. The server already knows who is signed in, so the
 * honest fix is to render it there too.
 *
 * Sign-out and delete go through server routes rather than supabase-js
 * directly: the auth cookies are set by the server, so clearing them
 * client-side leaves the middleware still seeing a valid user on the next full
 * page load -- you appear to log out and are then silently logged back in.
 */
export function WebAccountProvider({
  initial,
  children,
}: {
  initial: AccountSnapshot | null;
  children: React.ReactNode;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  // Same client, same lifetime as the account it authenticates for — the RLS
  // policies on `storage.objects` are what actually scope who may write, so
  // this needs no gating on `snapshot` itself.
  const uploader = React.useMemo(() => createSupabaseImageUploader(supabase), [supabase]);
  const [snapshot, setSnapshot] = React.useState<AccountSnapshot | null>(initial);

  React.useEffect(() => {
    // Keep in step with sign-in/sign-out that happen in another tab, and with
    // token refreshes that change nothing but should not clear the account.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSnapshot(session?.user ? toSnapshot(session.user) : null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const account = React.useMemo<Account | null>(() => {
    if (!snapshot) return null;
    return {
      ...snapshot,
      signOut: async () => {
        // A form POST rather than fetch: the route answers with a 303 to
        // /login, and letting the browser follow it navigates away and drops
        // the in-memory React state along with the cookies.
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/auth/sign-out";
        document.body.appendChild(form);
        form.submit();
      },
      deleteAccount: async (confirmEmail: string) => {
        const response = await fetch("/auth/delete-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmEmail }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Could not delete the account.");
        }
        window.location.assign("/login");
      },
    };
  }, [snapshot]);

  return (
    <AccountProvider account={account}>
      <ImageUploaderProvider uploader={uploader}>{children}</ImageUploaderProvider>
    </AccountProvider>
  );
}
