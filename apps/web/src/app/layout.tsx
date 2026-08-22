import React, { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${defaultClass}`}
      data-surface={themeObj.surface}
      data-brand={themeObj.brand}
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
