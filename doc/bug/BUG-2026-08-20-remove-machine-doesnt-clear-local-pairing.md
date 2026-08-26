# BUG-2026-08-20-remove-machine-doesnt-clear-local-pairing

**Status:** 🟢 resolved
**Reported by:** owner — hit while manually pairing a machine to verify the M10
Machines flow end-to-end
**Reported:** 2026-08-20

## Symptom

After removing a machine from the Machines page in the browser, redeeming a
fresh pairing code on that same computer fails:

```
This machine is already paired to workspace bbb75b15-eb72-47d4-94fe-3955802620aa.
Re-run with --force to replace that pairing, or --status to inspect it.
```

The owner read [`machines.md`](../../packages/ui/src/content/knowledge/machines.md)'s
own description of Remove — "The computer itself keeps its local data — pair it
again to reconnect" — followed it exactly (`sparstrow pair <code>`, no flags),
and got refused.

## Reproduction

1. Pair a machine (`sparstrow pair <code>`). Confirm it shows **active** on
   the Machines page.
2. In the browser, **Remove** that machine.
3. On the same computer, generate a new code and run
   `sparstrow pair <new-code>` — no `--force`.
4. **Expected** (per `machines.md`'s Remove/Revoke wording): pairing succeeds,
   the machine reappears.
   **Actual:** rejected with `EXIT_REJECTED`, telling the user to add
   `--force`.

Reproduced live in this session:
[`packages/core/src/cli/pair.ts`](../../packages/core/src/cli/pair.ts) run
directly — first attempt without `--force` failed exactly as above, second
attempt with `--force` succeeded.

## Investigation

Not a CLI bug — `pair.ts`'s refusal is intentional
([`pair.ts:124-137`](../../packages/core/src/cli/pair.ts:124), comment: "Refused
by default so a second run cannot silently move a machine between
workspaces"), and the error message it prints already names the fix
(`Re-run with --force`).

The actual defect is in what the Knowledge Center promises. `isPaired()`
([`client.ts`](../../packages/core/src/cloud/client.ts)) only checks whether a
token file exists in `config.secretsDir` (`~/.sparstrow`, machine-local,
outside the repo and outside the workspace's reach). **Removing or revoking a
machine in the browser only deletes the cloud-side row** — there is no
mechanism, and can be none, for the workspace to reach onto that computer's
disk and clear its stored token. So the local machine still looks "paired" to
the CLI regardless of what happened in the browser, and re-pairing always
needs `--force` — never "just pair it again."

`machines.md` describes both Revoke and Remove as if plain re-pairing works:

- Revoke: "pairing it again with a fresh code restores access"
- Remove: "pair it again to reconnect"

Neither mentions `--force`. The doc was written from the cloud-side behavior
(what Remove/Revoke do to the workspace record) without accounting for the
CLI's own local-token guard.

## Impact

Hits anyone who removes or revokes their own machine and tries to reconnect
it — which, per `machines.md`, is presented as the *normal* way to restore a
computer's access. They get an unexplained rejection the docs gave them no
reason to expect, on the same "first command on a terminal" surface
`BUG-2026-08-16-pairing-path-wrong-in-cli` already flagged as low-tolerance for
confusion. Workaround is trivial once known (`--force`), but nothing today
tells the user that.

## Resolution

**Fixed 2026-08-20, same turn.** Updated
[`machines.md`](../../packages/ui/src/content/knowledge/machines.md) so
Revoke and Remove both state plainly that re-pairing the *same* computer
needs `--force`, and why (the local token isn't and can't be cleared
remotely). No code change — the CLI's guard and its `--force` message are
correct as they are; only the doc's promise was wrong.

Verified by re-reading the edited sections against the reproduction above:
the doc now matches what the CLI actually requires.

**Re-verified live, same day, against a real deployment.** Ran the whole
cycle against `development.sparstrow.com` (not localhost): pair → active →
remove → plain re-pair correctly refused with "already paired" → `--force`
re-pair succeeds. Matches this file's reproduction and the doc fix exactly.
Details in [`deploy-web-app.md`](../runbooks/deploy-web-app.md)'s
2026-08-20 update note.
