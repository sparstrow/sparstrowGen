/**
 * Which OAuth providers this Supabase project actually has configured.
 *
 * `signInWithOAuth` does NOT report a disabled provider back to the caller. It
 * returns no error and navigates the browser to Supabase's /authorize
 * endpoint, which answers a bare
 *   {"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
 * as a JSON document. The user ends up staring at that on supabase.co, with no
 * way back and nothing that looks like our app -- so the friendly error
 * handling on the login page never gets a chance to run.
 *
 * The fix is to know beforehand. /auth/v1/settings is a public endpoint that
 * lists the enabled providers, so the login page asks first and disables the
 * buttons it cannot honour. Enable a provider in the dashboard and the buttons
 * light up on the next page load with no code change -- see
 * doc/runbooks/oauth-providers.md.
 */

export interface ProviderAvailability {
  github: boolean;
  google: boolean;
}

interface SettingsResponse {
  external?: Record<string, boolean>;
}

export async function fetchProviderAvailability(
  url: string,
  anonKey: string,
  signal?: AbortSignal,
): Promise<ProviderAvailability | null> {
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as SettingsResponse;
    const external = body.external ?? {};
    return { github: external.github === true, google: external.google === true };
  } catch {
    // Offline, blocked, or the project is unreachable. Returning null means
    // "unknown", and the caller leaves the buttons enabled rather than
    // hiding a working provider because one request failed.
    return null;
  }
}
