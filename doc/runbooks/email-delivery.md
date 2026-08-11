# Runbook — making Supabase actually send email

**Owner action.** Nothing in this repo can tell whether a message was delivered;
that needs someone to read an inbox.

## Why this exists

On 2026-08-10 the owner reported: *"I can't create an account, I'm not getting a
link to my email address."* The investigation found three separate things, and
only one of them was an email problem:

1. **Sign-up needs no email at all.** "Confirm email" is **off**, so
   `signUp()` returns a session immediately. Verified on a live signup: the new
   row came back with `email_confirmed_at` set and `confirmation_sent_at` null.
2. **The magic-link box looked like it worked and sent nothing.** With no
   account for that address, Supabase answers `otp_disabled`, which the login
   page deliberately swallows so the form can't be used to test who has an
   account. The success message was identical either way — so the one person who
   needed different advice ("you have no account yet") got none. Fixed: the
   message now says nothing is sent until an account exists.
3. **Delivery itself is unproven.** Every "magic link" used during M2/M3
   verification was minted with the **admin API** (`generateLink`), which returns
   a token and sends no mail. So the SMTP path had never once been exercised.

## The constraint that bites

Supabase's **built-in** email service is for development only:

- it delivers **only to addresses that are members of the project's Supabase
  organisation** — anyone else's mail is silently dropped;
- it is rate-limited to a handful of messages per hour.

A plus-address (`you+test@gmail.com`) is a *different string* from the member
address, so it may not match the team-member allowlist even though it reaches
the same inbox.

This is why "it works for me and not for anyone I invite" is the classic symptom.

## Step 1 — find out whether anything is arriving

From the repo root, with `apps/web/.env.local` loaded, send a real one to an
address whose inbox you can read **and which already has an account**:

```bash
node -e 'const{createClient}=require("@supabase/supabase-js");createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).auth.signInWithOtp({email:"YOU@example.com",options:{shouldCreateUser:false}}).then(r=>console.log(r.error??"accepted"))'
```

`accepted` means Supabase took the request — **not** that mail was delivered.
Check the inbox, and check spam. Then check **Auth → Logs** in the Supabase
dashboard, which records send failures the client never sees.

If it arrives, you only need step 2 when you add a user outside your org.

## Step 2 — configure custom SMTP

Supabase dashboard → **Project Settings → Authentication → SMTP Settings**.

Any transactional provider works; Resend, SendGrid, Postmark and Amazon SES all
have free or near-free tiers well above this app's volume. You will need:

- host, port (587 for STARTTLS), username, password
- a **sender address on a domain you control** — providers reject `@gmail.com`
  as a from-address, and so does deliverability in general
- SPF and DKIM DNS records at the domain, which the provider gives you

Then raise the rate limits under **Authentication → Rate Limits**, which stay at
the built-in defaults until you do.

## Step 3 — decide about "Confirm email"

It is currently **off**, which is why sign-up works with no mail at all. That is
a reasonable setting for a single-owner staging app and a bad one the moment
anyone else can reach the login page, since it lets someone register an address
they don't own.

**Turn it on only after step 2 passes.** With no working SMTP, turning it on
makes sign-up impossible rather than merely unverified — the account is created
and can never be confirmed.

## What to check when it's done

- A brand-new address that is **not** in your Supabase org can sign up and
  receive whatever mail its flow requires.
- **Authentication → Logs** shows sends, not errors.
- Update the row in [`README.md`](README.md) to ✅, and clear `G-11` from
  [`../KnownGaps.md`](../KnownGaps.md).
