import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@web/utils/supabase/env";

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
