#!/usr/bin/env node
/**
 * sparstrow-memory — CLI twin of the memory MCP server, for agents whose CLI
 * lacks MCP wiring (gemini via shell) and for humans.
 *
 *   sparstrow-memory search "competitor pricing" [--k 8]
 *   sparstrow-memory save --title "Fact" --scope agent --tags a,b --content "..."
 *   echo "long content" | sparstrow-memory save --title "Fact"
 */
import { parseArgs } from "node:util";

const API = process.env.SPARSTROW_API ?? "http://127.0.0.1:48750";
const RUN_ID = process.env.SPARSTROW_RUN_ID ?? "";

async function call(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sparstrow-run": RUN_ID },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* keep generic */
    }
    throw new Error(message);
  }
  return text;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "search") {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { k: { type: "string" } },
      allowPositionals: true,
    });
    const query = positionals.join(" ").trim();
    if (!query) throw new Error('usage: sparstrow-memory search "query" [--k 8]');
    const out = await call("/agent/memory/search", {
      query,
      k: values.k ? Number(values.k) : 8,
    });
    console.log(out);
    return;
  }

  if (command === "save") {
    const { values } = parseArgs({
      args: rest,
      options: {
        title: { type: "string" },
        scope: { type: "string" },
        tags: { type: "string" },
        content: { type: "string" },
      },
    });
    if (!values.title) throw new Error("--title is required");
    const content = values.content ?? (await readStdin());
    if (!content.trim()) throw new Error("provide --content or pipe content via stdin");
    const out = await call("/agent/memory/save", {
      title: values.title,
      content,
      scope: values.scope ?? "agent",
      tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    });
    console.log(out);
    return;
  }

  console.log(
    [
      "sparstrow-memory — agent memory access for Sparstrowgen",
      "",
      '  search "query" [--k 8]                         hybrid search over allowed scopes',
      '  save --title T [--scope agent|project|global] [--tags a,b] [--content "..."]',
      "                                                 (content may also be piped via stdin)",
      "",
      "Requires SPARSTROW_RUN_ID (set automatically on agent runs).",
    ].join("\n"),
  );
  process.exitCode = command ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
