import * as React from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  md: "max-w-4xl",
  lg: "max-w-6xl",
  full: "max-w-none",
} as const;

/**
 * Standard containment wrapper: centers page content at a consistent max-width
 * against the AppShell's padded main area, so simple pages don't each invent
 * their own gutters.
 */
export function PageContainer({
  size = "md",
  className,
  children,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto w-full", SIZES[size], className)}>{children}</div>;
}
