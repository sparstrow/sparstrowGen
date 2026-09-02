"use client";

import * as React from "react";
import { Copy, KeyRound, Loader2, Monitor, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { callAction } from "@web/lib/call-action";
import { relativeTime } from "@/lib/format";
import {
  createAccessTokenAction,
  listAccessTokensAction,
  revokeAccessTokenAction,
  type AccessTokenRow,
} from "./access-tokens-actions";

/**
 * US4 — the one page that answers "what can currently reach my account, and
 * when did it last do so".
 *
 * This card is not a nicety bolted onto the credential change; it is the reason
 * that change is safe to ship. The owner chose non-expiring tokens, so a
 * credential with no expiry and no visible list is one that can outlive the
 * laptop it was created on. See
 * `doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md`,
 * which lists this surface as a required compensating control.
 *
 * Revoked rows stay in the list rather than being filtered out — a revoked row
 * is the record that something HAD access, which is most of what someone comes
 * here to read.
 */

/** The one-time reveal. There is no path that can show this value again. */
function NewTokenPanel({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (permissions, an insecure origin). The
      // value is on screen and selectable, so this is a degraded copy button,
      // not a lost token — saying nothing is better than an error for
      // something the person can still do by hand.
    }
  }

  return (
    <div className="spg-turn space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4" role="status">
      <div className="space-y-1">
        <p className="text-sm font-medium">Copy this token now</p>
        <p className="text-sm text-muted-foreground">
          This is the only time it will be shown. If you lose it, revoke it and create another.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 font-mono text-xs">
          {token}
        </code>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Copy className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        I&apos;ve saved it
      </Button>
    </div>
  );
}

function TokenRow({
  token,
  onRevoked,
}: {
  token: AccessTokenRow;
  onRevoked: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function revoke() {
    setBusy(true);
    await callAction(() => revokeAccessTokenAction(token.id));
    setBusy(false);
    setConfirming(false);
    onRevoked();
  }

  const revoked = Boolean(token.revokedAt);

  return (
    <div className="flex items-center gap-3 border-b py-3 last:border-b-0">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground"
        aria-hidden="true"
      >
        {token.machineId ? <Monitor className="size-4" /> : <KeyRound className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {token.name}
          {revoked && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">· revoked</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {token.machineName ?? "Not yet used on a computer"} ·{" "}
          {/* "Never used" rather than a date that would be a lie about a
              credential nothing has presented yet. */}
          {token.lastUsedAt ? `last used ${relativeTime(token.lastUsedAt)}` : "never used"}
        </p>
      </div>

      {!revoked && (
        <Button
          size="icon"
          variant="ghost"
          // Destructive colour in the resting state, not only on hover: §6 of
          // the doctrine — a ghost trigger for an irreversible action
          // under-warns.
          className="size-8 shrink-0 text-destructive hover:text-destructive"
          aria-label={`Revoke ${token.name}`}
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Revoke this token?"
        description={
          token.machineName
            ? `${token.machineName} will stop being able to reach your account on its next request, and will show as disconnected. This cannot be undone — you can create a new token to reconnect it.`
            : "Anything using this token will stop being able to reach your account on its next request. This cannot be undone."
        }
        confirmLabel="Revoke"
        confirmVariant="destructive"
        onConfirm={() => void revoke()}
      />
    </div>
  );
}

export function AccessTokensCard() {
  const [tokens, setTokens] = React.useState<AccessTokenRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const result = await callAction(() => listAccessTokensAction());
    if (result.ok) {
      setTokens(result.data);
      setError(null);
    } else {
      // Explicitly NOT an empty list. An empty list here reads as "nothing has
      // access", which is the most dangerous thing this card could say wrongly.
      setTokens(null);
      setError(result.error);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    const result = await callAction(() => createAccessTokenAction(newName || "Access token"));
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRevealed(result.data.token);
    setNewName("");
    setCreating(false);
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">API Tokens</CardTitle>
        <CardDescription>
          Everything that can act as you. Signing in on a computer creates one automatically; you
          can also create one by hand for a machine that can&apos;t open a browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {revealed && <NewTokenPanel token={revealed} onDismiss={() => setRevealed(null)} />}

        {error ? (
          <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium">Couldn&apos;t load what has access</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : tokens === null ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound className="size-5" strokeWidth={1.8} />
              </EmptyMedia>
              <EmptyTitle>Nothing has access yet</EmptyTitle>
              <EmptyDescription>
                Opening the desktop app on a computer connects it automatically and creates a token
                here. Create one by hand only for a machine with no browser.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" /> Create a token
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div>
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} onRevoked={() => void load()} />
            ))}
          </div>
        )}

        {creating ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="What is this token for? e.g. Build server"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <Button size="sm" onClick={() => void create()} disabled={busy}>
              {busy && <Loader2 className="size-3.5 animate-spin" />} Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          tokens !== null &&
          tokens.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> Create a token
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
