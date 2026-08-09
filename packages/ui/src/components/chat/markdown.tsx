"use client";

import * as React from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reduce markdown source to plain reading text for the "Copy text" context-menu
 * action — strips formatting markers but keeps fenced-code content, so a copy
 * into a plain-text field (a Slack message, a form) doesn't carry `**`/`#`/`|`
 * noise. Not a full parser; good enough for a copy affordance, not for reflow.
 */
export function stripMarkdown(source: string): string {
  return source
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => code.trimEnd())
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, (m) => m.trimStart())
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      row
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join("  "),
    )
    .replace(/^\s*[-:| ]+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Fenced code block with a hover copy affordance. */
function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const preRef = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    const text = preRef.current?.innerText ?? "";
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group relative my-3 first:mt-0 last:mb-0">
      <pre
        ref={preRef}
        {...props}
        className="overflow-x-auto rounded-lg border bg-muted/40 p-3.5 font-mono text-[13px] leading-relaxed"
      >
        {children}
      </pre>
      <button
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 rounded-md border bg-background/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/**
 * Assistant-turn markdown (GFM + syntax highlighting), tuned to the chat
 * reading column: restrained heading scale, 15px prose, token-driven code
 * theme (see the `.hljs-*` rules in globals.css for both themes).
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="min-w-0 text-[15px] leading-7 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          p: ({ children }) => <p className="my-3">{children}</p>,
          h1: ({ children }) => (
            <h1 className="mb-2 mt-5 text-lg font-semibold tracking-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-base font-semibold tracking-tight">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-4 text-[15px] font-semibold">{children}</h3>
          ),
          h4: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold">{children}</h4>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
          li: ({ children }) => <li className="[&>p]:my-1">{children}</li>,
          a: ({ href, children }) => {
            const text = String(children);
            const isTryInApp =
              text.toLowerCase().includes("try in app") ||
              text.toLowerCase().includes("try it out");

            if (isTryInApp) {
              return (
                <span className="my-2 inline-block">
                  <Link
                    to={href || "/"}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Play className="size-3 fill-current" />
                    {children}
                  </Link>
                </span>
              );
            }

            return href?.startsWith("/") ? (
              <Link
                to={href}
                className="font-medium underline underline-offset-2 hover:text-muted-foreground"
              >
                {children}
              </Link>
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium underline underline-offset-2 hover:text-muted-foreground"
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l border-border pl-4 text-muted-foreground [&>p]:my-1">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          pre: CodeBlock,
          code: ({ className, children, ...props }) => {
            // Fenced blocks arrive with a `language-*` class and render inside
            // <pre>; everything else is inline code.
            const isBlock = /language-/.test(className ?? "");
            return isBlock ? (
              <code className={className} {...props}>
                {children}
              </code>
            ) : (
              <code
                className={cn(
                  "rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[13px]",
                  className,
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted/50 px-3 py-2 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b px-3 py-2 last:border-b-0">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
