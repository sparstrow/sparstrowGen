# Spec: Pairing a machine without typing a code

| | |
|---|---|
| **Status** | Owner-reviewed 2026-08-31 (decisions taken live, in conversation) |
| **Created** | 2026-08-31 |
| **Trigger** | Owner, after reviewing how [multica](../../references/multica) pairs a local daemon to a workspace: "the pairing should be like finding a machine and pairing not with code." |
| **Supersedes** | [`2026-08-16-setup-and-machines`](2026-08-16-setup-and-machines.md) US1 scenario 3, and US4 in full — both describe pairing-code behaviour that this spec replaces. Everything else in that spec (the Machines menu itself, the setup guide, machine status vocabulary) is untouched. |
| **Plan** | [`../plans/2026-08-31-browser-loopback-pairing.md`](../plans/2026-08-31-browser-loopback-pairing.md) |
| **Open questions** | none — both forks below were decided live with the owner |

> **Scope.** This spec covers only *how a machine and a workspace become
> linked* — the pairing step itself. It does not touch the Machines page's
> layout, the setup guide, or machine status/reachability, all of which stay
> exactly as `2026-08-16-setup-and-machines` already shipped them.

## The experience today

Pairing a machine means copying a code from one screen and typing it into
another. On the Machines page, pressing **Pair a machine** shows a 10-character
code (`XXXXX-XXXXX`) with a 10-minute countdown and the literal command
`sparstrow pair <code>` to run. The owner then switches to a terminal on the
machine they want to pair, and types that command — code included — by hand.
The code is single-use: it is consumed the moment the daemon redeems it, and a
reused or expired code fails with its own distinct message (today's US4).

This works, but it is manual in a way that has no reason to be: the machine
being paired is, in every real case so far, the same machine the owner is
sitting at when they press **Pair a machine** — there is already a browser
open, already a session signed in. The code exists only to get an identifier
from that browser tab into that terminal, a trip of a few inches that today
takes copying a string, alt-tabbing, and typing it correctly before a
10-minute clock runs out.

## What I expect instead

I run one command on the machine I want to pair. My browser opens by itself,
already knows who I am, and the machine is paired the moment I see the
confirmation page — I never read or type anything that looks like a code.

---

## User stories

### US1 — Pair a machine with nothing to type (Priority: P1)

I run the pairing command on my machine. It opens my browser to a page that
already knows I'm signed in and shows me which machine and workspace I'm
about to connect; one press of a button and it's paired — no code, no
countdown, nothing to copy or type.

**Why this priority:** this is the entire feature. There is no smaller unit
that's still worth shipping.

**Independent test:** on a machine with a browser available, run the pair
command with no arguments and confirm the machine appears on the Machines
page without having read or typed anything besides the command itself.

**Acceptance scenarios:**

1. **Given** I run the pair command on my machine, **When** it starts,
   **Then** my default browser opens automatically to a page for this
   specific pairing attempt.
2. **Given** that page opens and I'm already signed in, **When** the page
   loads, **Then** I see which machine and workspace I'm about to pair and one
   button to confirm it — no other fields, nothing to copy or type.
3. **Given** I press that button, **When** it completes, **Then** pairing
   finishes without leaving the page.
4. **Given** that page opens and I'm signed out, **When** I sign in normally,
   **Then** I land straight on that same confirm screen afterward, with no
   separate pairing step to repeat.
5. **Given** pairing succeeds, **When** I look at the terminal I ran the
   command in, **Then** it confirms success and names the machine and
   workspace it joined.
6. **Given** pairing succeeds, **When** I look at the Machines page without
   refreshing, **Then** the machine appears there — same behavior as today.
7. **Given** my browser can't be opened automatically (no display, a headless
   shell), **When** the command runs, **Then** it prints the exact URL to open
   manually and says why it couldn't open one itself, rather than hanging with
   no explanation.
8. **Given** I closed the browser tab or navigated away before confirming,
   **When** I look at the terminal, **Then** it eventually reports that
   pairing timed out waiting for the browser, not a silent hang.
9. **Given** the pairing page loads but belongs to a different pairing attempt
   than the one my terminal started (a stale tab, a replayed link), **When**
   I press confirm, **Then** it's rejected and neither side claims success.
10. **Given** I run the pair command on a machine that's already paired to a
    workspace, **When** I reach the confirm screen, **Then** it tells me
    plainly that confirming replaces the existing pairing, not left guessing
    which workspace the machine now belongs to.

---

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Pairing command (CLI) | existing, behavior changes | Run it; browser opens; nothing else to type |
| Browser pairing page | **new** | Confirms the pairing attempt is genuine and completes it while already signed in |
| Machines page | existing, behavior changes | No longer has a **Pair a machine** action that generates anything — only the CLI, running on the machine being paired, can open that machine's own loopback listener. The empty state and "add another" affordance become instructional: the exact command to run, and what happens after |

### The four states

| State | What the owner sees |
|---|---|
| **Populated** (browser pairing page) | Machine identity (name, OS, hostname), the workspace it's joining, one **Authorize this machine** button, then confirmation once pressed |
| **Empty** — n/a | This surface only ever exists mid-attempt; there's no empty variant to design for |
| **Loading** — n/a on the Machines page | There is nothing for it to wait on anymore — a pending attempt lives only in the CLI's own process and the confirm page it opened, neither of which the Machines page has any handle on until the machine actually appears |
| **Error** | Names what actually failed: browser wouldn't open (with the manual URL), the attempt timed out, the attempt was stale/replayed, the workspace couldn't be reached — never a bare "pairing failed" |

### Flow

**Pairing:** run the command → browser opens to a page tied to this one
attempt → already-signed-in owner presses **Authorize this machine** →
machine appears on the Machines page, active.

**Dead ends to check:** browser doesn't open (headless); the tab is closed
before completing; the page is reopened after the attempt already finished or
expired; the command is run twice concurrently for the same machine.

## Edge cases

- What happens if two pairing attempts are started for the same machine at
  once — does the second cancel the first, or do they race?
- How long does an attempt stay valid before the terminal gives up waiting?
- What does the browser page say if it's opened after the terminal that
  started it has already exited?
- Does anything about the browser page leak which workspaces the signed-in
  account belongs to, if the account has more than one?

## Requirements

### Functional requirements

- **FR-001**: Running the pairing command MUST open the owner's default
  browser without requiring them to read or type anything to get there.
- **FR-002**: The browser page MUST identify the specific machine and pairing
  attempt it belongs to, so a stale or unrelated page can never complete a
  different attempt.
- **FR-003**: If already signed in, the browser page MUST show the machine and
  workspace identity plus a single confirm action, and complete pairing on
  that one press — no code, no other fields.
- **FR-004**: If signed out, the normal sign-in flow MUST lead straight into
  that same confirm screen afterward, not a repeated pairing step.
- **FR-005**: The system MUST reject a pairing completion that doesn't match
  the attempt the terminal is waiting on (replay/cross-attempt protection).
- **FR-006**: If the browser can't be opened automatically, the command MUST
  print the URL to open manually and say why it couldn't open one itself.
- **FR-007**: The command MUST eventually give up and report a timeout if
  nothing completes the browser side, rather than hanging indefinitely.
- **FR-008**: Re-running the pairing command on an already-paired machine
  MUST tell the owner plainly that it replaces the existing pairing.
- **FR-009**: The credential the machine ends up holding MUST never be
  displayed on the browser page or printed anywhere it could be shoulder-surfed
  — same non-negotiable as today's token handling, only the path to get it
  changes.

### Key entities

- **Pairing attempt**: a single, ephemeral, machine-initiated request to join
  a workspace — replaces today's **Pairing code**. It exists only for the
  duration of one command run, has no display value a person ever reads aloud
  or types, and is tied to one specific browser round-trip rather than being
  a bearer secret someone could copy incorrectly or leak in a screenshot.

## Success criteria

- **SC-001**: Pairing a machine that has a browser available requires no
  copying or typing of any code, start to finish.
- **SC-002**: A machine paired this way appears on the Machines page
  indistinguishably from one paired the old way — same identity fields, same
  active/unreachable behavior.
- **SC-003**: Every failure mode in US1's unhappy-path scenarios (no browser,
  timeout, stale attempt, re-pairing) produces a message naming the actual
  cause, not a generic failure.

## Assumptions

- **The machine being paired always has (or can reach) a browser.** This is
  the fork decided live with the owner: a headless/remote machine with no
  local browser at all (a bare server, a CI runner, some WSL setups) loses the
  pairing capability it has today, where a code generated on any device could
  be typed into a completely disconnected terminal. Filed as
  [`D-29`](../Deferred.md) rather than silently dropped.
- **Distribution is still the pre-existing gap, unchanged by this spec.**
  `sparstrow pair` still only runs from a dev checkout today
  ([`D-10`](../Deferred.md)) — this spec changes what the command does once
  it runs, not whether it can be run outside this monorepo yet.
- **The `pairing_codes` mechanism is removed outright, not kept dormant.**
  Consistent with the owner's choice below: no code path is left half-wired
  as a fallback that could silently rot.
- **Out of scope, deliberately**: everything about the Machines page besides
  the pairing panel itself, the setup guide, and machine status/reachability
  — all already specified by `2026-08-16-setup-and-machines` and unaffected
  here.

## Owner review

**Reviewed:** 2026-08-31 — accepted, with two decisions made live in
conversation (recorded here since there was no separate async review pass):

1. **Browser-loopback replaces the pairing code entirely** (not layered on
   top of it) — after comparing against multica's `multica login` /
   `multica pair` flow, which never shows a code at all.
2. **No code-based fallback is kept for headless machines.** The owner chose
   "browser-only, drop the code path entirely" over keeping `--code` as an
   escape hatch, explicitly accepting that headless/remote pairing becomes
   unsupported until a separate piece of work addresses it — see
   [`D-29`](../Deferred.md).

**Second review pass, same day — after reading multica's actual frontend
(`references/multica/packages/views/auth/login-page.tsx`), not just its
backend.** The first draft specced zero-click pairing (US1 scenario 2
originally: "the moment that page loads, my machine is paired"). Multica
itself does not do this — its CLI-authorization screen shows the signed-in
account and one **Authorize** button before redirecting the token back to the
CLI's local listener. Presented to the owner as a fork (adopt the one-click
confirm, or keep zero-click and rely on the loopback-only callback validation
as the sole mitigation); **the owner chose the one-click confirm**, closing
the CSRF-shaped gap the first draft's Decisions section had accepted as
residual risk rather than merely mitigated. US1 scenarios 2–4 and FR-003/
FR-004 were rewritten accordingly — "pairs on load" everywhere became "shows
identity + one confirm button, pairs on that press".
