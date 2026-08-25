import type { ActionResult } from "./action-result";

/**
 * What a converted button shows when the app itself cannot be reached.
 *
 * Names the app rather than the network, for the reason the desktop shell's
 * offline screen gives: "a screen that says only 'You're offline' sends someone
 * to check their wifi for what is actually" a problem somewhere else. The
 * action did not run, so nothing was saved and retrying is safe — both worth
 * saying, because a failed write whose outcome is ambiguous is worse than one
 * that plainly did not happen.
 */
export const UNREACHABLE =
  "Couldn't reach Sparstrowgen, so nothing was saved. Check your connection and try again.";

/**
 * Call a Server Action and get an `ActionResult` back **even when the action
 * never ran**.
 *
 * `ActionResult` (plan DD-3) covers failures the action itself returns —
 * a 400 with a field message, a `Not Found`, a refusal. It cannot cover a
 * **transport** failure, because there is no action invocation to return
 * anything: the fetch rejects and, inside a `useTransition`, surfaces as an
 * unhandled rejection and a full-screen "Runtime TypeError: Failed to fetch"
 * overlay.
 *
 * That is a regression the conversion introduces if left alone. React Query's
 * `onError` used to catch network failures alongside server ones, so before
 * band 22 a dropped connection produced a line of text in the dialog. This
 * wrapper restores that, and is why **every action call site goes through it**
 * rather than awaiting the action directly:
 *
 * ```ts
 * const r = await callAction(() => createTeamAction(input));
 * if (!r.ok) { setError(r.error); return; }
 * ```
 *
 * Found by `T-WA-01` while answering "does the Electron app work offline?" —
 * the desktop shell loads the hosted app over the network, so every one of
 * these buttons is one dropped connection away from this path.
 * See `BUG-2026-08-25-network-failure-during-a-server-action-is-an-unhandled-rejection`.
 *
 * A `redirect()` or `notFound()` thrown inside a Server Action is Next.js
 * control flow, not an error, and is deliberately **re-thrown** — swallowing it
 * would make the navigation silently never happen. That is the same trap
 * `deleteTeamAction` avoids by not calling `redirect()` at all.
 */
export async function callAction<T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    console.error("Server Action transport failure:", err);
    return { ok: false, error: UNREACHABLE };
  }
}

/**
 * Next.js signals `redirect()` and `notFound()` by throwing a tagged error.
 * Checked by its digest rather than by instance, which is what Next's own
 * `isRedirectError` does — the error crosses a bundle boundary, so
 * `instanceof` is not reliable here.
 */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}
