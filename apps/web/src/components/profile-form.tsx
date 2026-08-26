import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@web/api/hooks";
import { useAccount } from "@web/lib/account";
import { callAction } from "@web/lib/call-action";
import { updateProfileAction, type UpdateProfileInput } from "@web/app/settings/actions";
import { ActorAvatar } from "@/components/actor-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageUploadField } from "@web/components/image-upload-field";
import { LongTextField, SingleLineField } from "@/components/form-field";

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email & password",
  github: "GitHub",
  google: "Google",
};

/**
 * T-M10-02 — the profile step, rendered both inside the setup guide
 * (`variant="inline"`) and as its permanent home in Settings → Account →
 * Profile (`variant="card"`). One component, per spec decision 4's rejection
 * of duplicating the same logic for two chrome treatments.
 *
 * **`variant="card"` also carries the account-level extras** (provider,
 * user id, sign-out) that `variant="inline"` never shows — those come from
 * the *session* (`useAccount()`), not the profile *row* (`useProfile()`),
 * and only Settings is the right place for a sign-out button. `ProfileCard`
 * in `settings.tsx` still owns the `account === null` local-desktop branch;
 * this component is only ever mounted once that check has already passed.
 *
 * **Only `name` gates the step (FR-020).** Avatar and about-you are offered,
 * never required — an upload that blocks setup is exactly the friction that
 * makes someone abandon a guide.
 *
 * **Placeholders, never a `defaultValue` derived from anything.** A fresh
 * account's `name` and `bio` are `''` (T-M9-01) — that is the correct empty
 * state, not something to fill in from the email. Scenario 9.
 */
export function ProfileForm({ variant }: { variant: "card" | "inline" }) {
  const profile = useProfile();
  const account = useAccount();
  const queryClient = useQueryClient();

  /** `SingleLineField`/`LongTextField`/`ImageUploadField` all expect `onSave`
   *  to REJECT on failure (their own `useFieldDraft`/`status` own the pending
   *  and error UI) — `callAction`'s `ActionResult` doesn't throw, so this is
   *  the one place in the phase that translates a failure back into one. */
  const save = async (data: UpdateProfileInput) => {
    const r = await callAction(() => updateProfileAction(data));
    if (!r.ok) throw new Error(r.error);
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
    return r.data;
  };

  const body = profile.isLoading ? (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-16 rounded-lg" />
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  ) : profile.isError || !profile.data ? (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-destructive">
        Couldn't check this. {profile.error?.message ?? ""}
      </p>
      <Button variant="outline" size="sm" onClick={() => void profile.refetch()}>
        Retry
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      <ImageUploadField
        currentUrl={profile.data.avatarUrl}
        prefix={`avatars/${profile.data.id}`}
        onSave={(url) => save({ avatarUrl: url })}
        label="avatar"
        fallback={
          <ActorAvatar
            name={profile.data.name || null}
            kind="user"
            size="lg"
            className="size-12 text-base"
          />
        }
      />

      <SingleLineField
        id="profile-name"
        label="Your name"
        value={profile.data.name}
        placeholder="e.g. Sri Hari"
        maxLength={60}
        onSave={(name) => save({ name })}
      />

      <LongTextField
        id="profile-bio"
        label="About you"
        helper="Read by agents working on your behalf — background, preferences, how you like things done."
        value={profile.data.bio}
        placeholder="e.g. Backend engineer (Go + Postgres). Prefer terse PRs and tests alongside the change."
        maxLength={2000}
        rows={4}
        onSave={(bio) => save({ bio })}
      />

      {variant === "card" && account ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Signed in with</span>
            <Badge variant="secondary">
              {PROVIDER_LABELS[account.provider] ?? account.provider}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs text-muted-foreground">{account.id}</span>
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => void account.signOut()}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (variant === "inline") return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Profile</CardTitle>
        <CardDescription>
          {account?.email ?? "Your avatar, name and a few lines about you."}
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
