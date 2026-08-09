"use client";

import React from "react";
import NextLink from "next/link";
import { useRouter as useNextRouter, usePathname, useSearchParams } from "next/navigation";

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

export function useNavigate() {
  const router = useNextRouter();
  return (options: { to?: string; params?: Record<string, any>; search?: (prev: any) => any; replace?: boolean }) => {
    let href = options.to || "";
    if (options.params) {
      for (const key of Object.keys(options.params)) {
        href = href.replace(`$${key}`, String(options.params[key]));
      }
    }
    if (options.search) {
       const s = options.search({});
       if (s && typeof s === 'object') {
           const qs = new URLSearchParams(s as any).toString();
           if(qs) href += `?${qs}`;
       }
    }
    if (options.replace) {
      router.replace(href);
    } else {
      router.push(href);
    }
  };
}

export function useSearch() {
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

export function useParams() {
  try {
    const nextParams = require("next/navigation").useParams();
    return nextParams || {};
  } catch (_e) {
    return {};
  }
}

export const Link = React.forwardRef<HTMLAnchorElement, any>((props, ref) => {
  const { to, params, search, className, activeProps, ...rest } = props;
  const pathname = usePathname();

  let href = to || "";
  if (params) {
    for (const key of Object.keys(params)) {
      href = href.replace(`$${key}`, String(params[key]));
    }
  }
  if (search) {
    const s = typeof search === 'function' ? search({}) : search;
    if (s && typeof s === 'object') {
      const qs = new URLSearchParams(s as any).toString();
      if (qs) href += `?${qs}`;
    }
  }

  const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));
  const finalClassName =
    isActive && activeProps ? `${className || ""} ${activeProps.className || ""}` : className;

  return (
    <NextLink ref={ref} href={href} className={finalClassName} {...rest} />
  );
});
Link.displayName = "Link";
