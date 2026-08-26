import * as React from "react";

/**
 * The signed-in account, when there is one.
 *
 * @sparstrow/ui is shared by two hosts that disagree about whether accounts
 * exist at all: the web app authenticates against Supabase, while the local
 * desktop build is a single-user install on 127.0.0.1 with nothing to sign in
 * to. Rather than fork the shell, the account arrives through context and the
 * default is `null` -- so the desktop build keeps exactly the behaviour it has
 * today (affordances present but disabled, with a tooltip saying why) and the
 * web app lights them up by providing a value.
 *
 * `null` therefore means "this host has no concept of accounts", which is not
 * the same as "nobody is signed in" -- the web app never renders the shell
 * without a session, because the middleware redirects first.
 */
export interface Account {
  /** Supabase user id. Shown in settings so a support request can name it. */
  id: string;
  email: string;
  /** Display name from provider metadata, falling back to the email local part. */
  name: string;
  avatarUrl: string | null;
  /** "email", "github", "google" -- what they actually signed in with. */
  provider: string;
  /** Ends the session server-side and returns to the login page. */
  signOut: () => Promise<void>;
  /**
   * Permanently deletes the account. `confirmEmail` must match the account's
   * own address; the server re-checks it, so the UI gate is not the only one.
   * Rejects with a readable message when the server refuses.
   */
  deleteAccount: (confirmEmail: string) => Promise<void>;
}

const AccountContext = React.createContext<Account | null>(null);

export function AccountProvider({
  account,
  children,
}: {
  account: Account | null;
  children: React.ReactNode;
}) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account | null {
  return React.useContext(AccountContext);
}
