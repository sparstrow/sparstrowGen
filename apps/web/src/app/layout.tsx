import React, { Suspense } from "react";
import type { Metadata } from "next";
// DESIGN.md §3 names Inter Variable, and `globals.css` sets `--font-sans` to
// it. Nothing loaded it here until 2026-08-24 — the only import lived in the
// Vite entry — so the app rendered in the system fallback while separately
// downloading Geist, which no token referenced. See
// doc/bug/BUG-2026-08-24-hosted-app-never-loads-its-typeface.md.
import "@fontsource-variable/inter";
import "./globals.css";

import { AppShell } from "@web/components/layout/app-shell";
import { Providers } from "@web/components/providers";
import { toSnapshot } from "@web/lib/auth/account-snapshot";
import { createClient } from "@web/utils/supabase/server";

export const metadata: Metadata = {
  title: "Sparstrowgen",
  description: "Sparstrow AI OS",
};

import { cookies } from "next/headers";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the account on the server so the shell's first paint already shows
  // who is signed in. Doing this only in a client effect made the server and
  // client disagree on the sidebar's identity line and broke hydration for the
  // entire tree.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? toSnapshot(user) : null;

  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme-prefs");
  let themeObj = { surface: "paper", brand: "amber", mode: "system" };
  if (themeCookie?.value) {
    try {
      themeObj = JSON.parse(themeCookie.value);
    } catch (e) {}
  }

  // If mode is explicit dark or light, set it. If system, default to dark but the
  // client script will correct it instantly before paint.
  const defaultClass = themeObj.mode === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      className={`h-full antialiased ${defaultClass} surface-${themeObj.surface} theme-${themeObj.brand}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let prefs = ${JSON.stringify(themeObj)};
                if (prefs.mode === 'system') {
                  let isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(isDark ? 'dark' : 'light');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers account={account}>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
