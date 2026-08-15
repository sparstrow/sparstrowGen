import { afterEach, describe, expect, it } from "vitest";
import { MissingConfigError, supabaseAnonKey, supabaseUrl } from "./env";

/**
 * A missing environment variable takes down every route, because the
 * middleware matcher covers all of them. That is correct — nothing works
 * without Supabase — but it must be *legible*, and it must stay
 * distinguishable from a real fault so the middleware's catch never becomes a
 * catch-all that turns a genuine bug into a tidy error page.
 */
describe("supabase env", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("throws MissingConfigError, not a bare Error", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => supabaseUrl()).toThrow(MissingConfigError);
  });

  it("names the variable on the error, so the middleware can show which one", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      supabaseAnonKey();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingConfigError);
      expect((error as MissingConfigError).variable).toBe("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
  });

  it("mentions that Vercel configures Preview and Production separately", () => {
    // The failure mode this was written for: a variable set only for
    // Production, leaving every preview deployment dead with no message.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => supabaseUrl()).toThrow(/Preview and Production are configured separately/);
  });

  it("treats an empty string as missing", () => {
    // Vercel will happily store an empty value, and `""` fails later in a much
    // worse place than here.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    expect(() => supabaseUrl()).toThrow(MissingConfigError);
  });

  it("returns the value when it is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    expect(supabaseUrl()).toBe("https://example.supabase.co");
  });
});
