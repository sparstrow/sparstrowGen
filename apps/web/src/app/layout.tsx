import React, { Suspense } from "react";
import type { Metadata } from "next";
// DESIGN.md §3 names Inter Variable, and `globals.css` sets `--font-sans` to
// it. Nothing loaded it here until 2026-08-24 — the only import lived in the
// Vite entry — so the app rendered in the system fallback while separately
// downloading Geist, which no token referenced. See
// doc/bug/BUG-2026-08-24-hosted-app-never-loads-its-typeface.md.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import {
  GeistPixelSquare,
  GeistPixelGrid,
  GeistPixelCircle,
  GeistPixelTriangle,
  GeistPixelLine,
} from "geist/font/pixel";
import "./globals.css";

import { AppShell } from "@web/components/layout/app-shell";
import { Providers } from "@web/components/providers";
import { toSnapshot } from "@web/lib/auth/account-snapshot";
import { createClient } from "@web/utils/supabase/server";
import { getKnowledgeIndex } from "@web/lib/knowledge.server";

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
  // Static repo content, not user data — read once here rather than a second
  // client-side fetch. See getKnowledgeIndex's own comment for why this
  // can't just be imported directly by breadcrumbs.tsx/tab-strip.tsx.
  const knowledgeIndex = getKnowledgeIndex();

  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme-prefs");
  let themeObj = { surface: "paper", brand: "amber", mode: "dark" };
  if (themeCookie?.value) {
    try {
      themeObj = { ...themeObj, ...JSON.parse(themeCookie.value) };
    } catch (e) {}
  }

  // Dark-first doctrine (DESIGN.md §1 & §2.3: "Ships as: Amber on Paper, dark mode.")
  const defaultClass = themeObj.mode === "light" ? "light" : "dark";

  const fontClasses = [
    GeistSans.variable,
    GeistMono.variable,
    GeistPixelSquare.variable,
    GeistPixelGrid.variable,
    GeistPixelCircle.variable,
    GeistPixelTriangle.variable,
    GeistPixelLine.variable,
  ].join(" ");

  return (
    <html
      lang="en"
      className={`h-full antialiased ${defaultClass} surface-${themeObj.surface} theme-${themeObj.brand} ${fontClasses} font-sans`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let prefs = ${JSON.stringify(themeObj)};
                if (prefs.mode === 'system') {
                  let isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(isLight ? 'light' : 'dark');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers account={account}>
          <Suspense fallback={null}>
            <AppShell knowledgeIndex={knowledgeIndex}>{children}</AppShell>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
