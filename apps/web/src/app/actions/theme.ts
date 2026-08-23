"use server";

import { cookies } from "next/headers";
import { createClient } from "@web/utils/supabase/server";

export async function saveThemePreference(surface: string, brand: string, mode: string) {
  const cookieStore = await cookies();
  
  // Save to Next.js cookie for instant SSR
  cookieStore.set("theme-prefs", JSON.stringify({ surface, brand, mode }), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });

  // Save to Supabase Cloud DB for this user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    await supabase
      .from("users")
      .update({
        theme_surface: surface,
        theme_brand: brand,
        theme_mode: mode,
      })
      .eq("id", user.id);
  }

  return { success: true };
}
