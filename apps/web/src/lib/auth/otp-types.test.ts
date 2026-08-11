import { describe, it, expect } from "vitest";
import { destinationForOtpType, isHandledOtpType } from "./otp-types";

describe("isHandledOtpType", () => {
  it("accepts every link type Supabase actually mails", () => {
    // Each of these is a live flow. Dropping one from the table does not fail
    // a build or a type check -- it just makes that flow's emails land on
    // "that link is not valid", which is exactly how `magiclink` went missing
    // when sign-in-by-link was first added.
    for (const type of ["magiclink", "signup", "recovery", "invite", "email_change", "email"]) {
      expect(isHandledOtpType(type), `${type} must be handled`).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isHandledOtpType(null)).toBe(false);
    expect(isHandledOtpType("")).toBe(false);
    expect(isHandledOtpType("wat")).toBe(false);
    // Phone OTP types are real Supabase values but this app has no phone auth;
    // accepting them would mean calling verifyOtp with a token we cannot have.
    expect(isHandledOtpType("sms")).toBe(false);
    expect(isHandledOtpType("phone_change")).toBe(false);
  });
});

describe("destinationForOtpType", () => {
  it("sends a recovery link to the password form, not the dashboard", () => {
    // A recovery link signs you in. Landing on "/" turns it into an ordinary
    // session and the password is never actually changed -- the user believes
    // they reset it and the old one still works.
    expect(destinationForOtpType("recovery")).toBe("/auth/reset-password");
  });

  it("sends every other link type to the app", () => {
    expect(destinationForOtpType("magiclink")).toBe("/");
    expect(destinationForOtpType("signup")).toBe("/");
    expect(destinationForOtpType("email_change")).toBe("/");
  });
});
