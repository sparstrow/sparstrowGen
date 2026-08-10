import { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toCamel, toSnake } from "../case";

export type HandlerContext = {
  supabase: SupabaseClient;
  workspaceId: string;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  body: any;
};

export type Handler = (ctx: HandlerContext) => Promise<NextResponse> | NextResponse;

export type RouteDefinition = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  pattern: string; // e.g., "/agents/:id/skills"
  handler: Handler;
  opaqueKeys?: string[];
};

export const ROUTES: RouteDefinition[] = [];

export function registerRoute(def: RouteDefinition) {
  ROUTES.push(def);
}

export function matchRoute(method: string, path: string): { route: RouteDefinition; params: Record<string, string> } | null {
  for (const route of ROUTES) {
    if (route.method !== method) continue;

    const regexPattern = "^" + route.pattern.replace(/:([a-zA-Z0-9_]+)/g, "(?<$1>[^/]+)") + "$";
    const regex = new RegExp(regexPattern);
    const match = path.match(regex);

    if (match) {
      return {
        route,
        params: match.groups || {},
      };
    }
  }
  return null;
}

export function ok(data: any, opaqueKeys?: string[]) {
  return NextResponse.json(toCamel(data, opaqueKeys));
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export function parseBody(rawBody: any, opaqueKeys?: string[]) {
  return toSnake(rawBody, opaqueKeys);
}

export function handleError(err: any) {
  console.error("API Route Error:", err);
  
  if (err && typeof err === "object" && err.code) {
    if (err.code === "42501") return fail(403, "Forbidden by Row Level Security");
    if (err.code === "23505") return fail(409, "Resource already exists (unique violation)");
    if (err.code === "23503") return fail(400, "Invalid reference (foreign key violation)");
  }
  
  return fail(500, "Internal Server Error");
}
