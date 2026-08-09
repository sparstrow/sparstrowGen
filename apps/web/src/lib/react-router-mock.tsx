"use client";

import React from "react";
import NextLink from "next/link";
import {
  useRouter as useNextRouter,
  useParams as useNextParams,
  usePathname,
  useSearchParams,
} from "next/navigation";

/**
 * TanStack Router accepts a route-scoping argument on most of its hooks
 * (`{ from: "/runs/$runId" }`, `{ strict: false }`). Next resolves params and
 * search from the live URL instead, so the option is accepted and ignored —
 * it only exists to keep the @sparstrow/ui call sites type-compatible.
 */
interface RouteScopeOptions {
  from?: string;
  strict?: boolean;
}

/** TanStack allows search as either a literal object or an updater function. */
type SearchInput = Record<string, unknown> | ((prev: Record<string, unknown>) => unknown);

function toQueryString(search: SearchInput | undefined): string {
  if (!search) return "";
  const resolved = typeof search === "function" ? search({}) : search;
  if (!resolved || typeof resolved !== "object") return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved as Record<string, unknown>)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function applyParams(to: string, params: Record<string, unknown> | undefined): string {
  if (!params) return to;
  let href = to;
  for (const key of Object.keys(params)) {
    href = href.replace(`$${key}`, String(params[key]));
  }
  return href;
}

export interface RouterState {
  location: {
    pathname: string;
    searchStr: string;
  };
}

export function useRouterState<T = RouterState>({ select }: { select?: (s: RouterState) => T } = {}): T {
  const pathname = usePathname() || "/";
  let searchStr = "";
  try {
    const searchParams = useSearchParams();
    searchStr = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  } catch (_e) {
    // In SSG static generation, useSearchParams may require Suspense
  }
  const state: RouterState = { location: { pathname, searchStr } };
  return select ? select(state) : (state as unknown as T);
}

export function useRouter() {
  const router = useNextRouter();
  return {
    history: {
      push: (path: string) => router.push(path),
      replace: (path: string) => router.replace(path),
      back: () => router.back(),
      forward: () => router.forward(),
    },
  };
}

export function useNavigate(_opts?: RouteScopeOptions) {
  const router = useNextRouter();
  const pathname = usePathname() || "/";
  return (options: {
    to?: string;
    params?: Record<string, unknown>;
    search?: SearchInput;
    replace?: boolean;
  }) => {
    // TanStack treats a missing `to` as "stay on the current route and only
    // change search params". Falling back to "" would push an empty URL.
    const href = applyParams(options.to || pathname, options.params) + toQueryString(options.search);
    if (options.replace) {
      router.replace(href);
    } else {
      router.push(href);
    }
  };
}

export function useSearch(_opts?: RouteScopeOptions) {
  const obj: Record<string, string> = {};
  try {
    const params = useSearchParams();
    if (params) {
      params.forEach((val, key) => {
        obj[key] = val;
      });
    }
  } catch (_e) {
    // In SSG static generation, useSearchParams may require Suspense
  }
  return obj;
}

export function useParams<T extends Record<string, any> = Record<string, any>>(
  _opts?: RouteScopeOptions,
): T {
  // Static `import` rather than `require` — this module is bundled as ESM for
  // the client, where `require` is not defined at runtime.
  return (useNextParams() ?? {}) as T;
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to?: string;
  params?: Record<string, unknown>;
  search?: SearchInput;
  activeProps?: { className?: string };
  /** `{ exact: true }` opts out of prefix matching for the active state. */
  activeOptions?: { exact?: boolean };
}
// NB: no `[key: string]: any` escape hatch here. `forwardRef` runs props
// through `Omit`, which collapses a type with a string index signature down to
// just that signature — erasing `onClick` & co. and silently reintroducing
// implicit-any callback params at every call site.

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => {
  // `activeProps`/`activeOptions` must be destructured out, not left in `rest` —
  // otherwise they are spread onto the underlying <a> as unknown DOM attributes.
  const { to, params, search, className, activeProps, activeOptions, ...rest } = props;
  const pathname = usePathname();

  const href = applyParams(to || "", params) + toQueryString(search);

  const isActive = activeOptions?.exact
    ? pathname === href
    : pathname === href || (href !== "/" && !!pathname?.startsWith(href));
  const finalClassName =
    isActive && activeProps ? `${className || ""} ${activeProps.className || ""}` : className;

  return (
    <NextLink
      ref={ref}
      href={href}
      className={finalClassName}
      aria-current={isActive ? "page" : undefined}
      {...rest}
    />
  );
});
Link.displayName = "Link";
