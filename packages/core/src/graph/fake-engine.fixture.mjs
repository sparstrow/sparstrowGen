// Test fixture: a minimal MCP stdio server with ZERO dependencies (raw
// newline-delimited JSON-RPC), so it runs from any cwd via process.execPath.
// Modes (argv[2]):
//   echo      — tools/call replies with the args it received
//   crash     — exits(1) immediately (crash-loop / breaker tests)
//   hang-init — never answers initialize (connect-timeout tests)
// The `sleep` tool waits args.ms before replying (request-timeout tests).
import readline from "node:readline";

const mode = process.argv[2] ?? "echo";
if (mode === "crash") process.exit(1);

const rl = readline.createInterface({ input: process.stdin });
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // notification (initialized) — no reply

  if (msg.method === "initialize") {
    if (mode === "hang-init") return; // never reply
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        protocolVersion: msg.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fake-engine", version: "0.0.1" },
      },
    });
    return;
  }
  if (msg.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        tools: [
          { name: "echo", description: "echo args", inputSchema: { type: "object" } },
          { name: "sleep", description: "sleep args.ms", inputSchema: { type: "object" } },
        ],
      },
    });
    return;
  }
  if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params;
    const result = (text) => send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } });
    // Engine-shaped responses used by graph-tools tests:
    if (name === "list_projects") {
      result(JSON.stringify(mode === "empty" ? { projects: [] } : { projects: [{ name: "fixture-project" }] }));
      return;
    }
    if (name === "big" || args?.big === true) {
      result("x".repeat(100_000));
      return;
    }
    const reply = () => result(JSON.stringify({ tool: name, args: args ?? {}, pid: process.pid }));
    if (name === "sleep") setTimeout(reply, args?.ms ?? 1000);
    else reply();
    return;
  }
  if (msg.method === "ping") {
    send({ jsonrpc: "2.0", id: msg.id, result: {} });
    return;
  }
  send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } });
});

rl.on("close", () => process.exit(0));
