import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { EffectiveTools } from "@sparstrow/shared";
import type { RunContext } from "../memory/agent-memory.js";
import {
  AGENT_CAPABILITIES,
  OWNED_CAPABILITY_NAMES,
  dispatchCapability,
  nativeToolSchemas,
  registerCapabilities,
  renderCapabilityDocs,
  toolResultText,
  zodToJsonSchema,
} from "./capability-registry.js";
import { CAPABILITY_DOCS } from "./capability-docs.js";

describe("capability registry (rule 20)", () => {
  it("every owned capability has both a handler and params — no half-registered tool", () => {
    for (const cap of AGENT_CAPABILITIES) {
      expect(cap.handler, `${cap.name} missing handler`).toBeTruthy();
      expect(cap.params, `${cap.name} missing params`).toBeTruthy();
    }
  });

  it("single source can't drift: every owned capability is documented in CAPABILITY_DOCS", () => {
    const documented = new Set(CAPABILITY_DOCS.map((d) => d.name));
    for (const name of OWNED_CAPABILITY_NAMES) {
      expect(documented.has(name), `${name} is owned but not documented`).toBe(true);
    }
  });

  it("registerCapabilities registers exactly the owned capabilities into an MCP server", () => {
    const registered: string[] = [];
    const fakeServer = { tool: (name: string) => registered.push(name) } as never;
    registerCapabilities(fakeServer, { runId: "run_x", agent: {}, projectSlug: null, taskId: null } as never);
    expect(registered.sort()).toEqual([...OWNED_CAPABILITY_NAMES].sort());
    // task_block is the first owned capability.
    expect(registered).toContain("task_block");
  });

  it("preamble docs group by intent and carry the escalation ladder", () => {
    const docs = renderCapabilityDocs();
    expect(docs).toContain("## Your tools, by intent");
    expect(docs).toContain("`task_block`");
    expect(docs).toContain("**Escalate**");
    expect(docs).toContain("Escalation ladder");
    // The ladder distinguishes the three escalation paths.
    expect(docs).toMatch(/message_send.*lead/);
    expect(docs).toMatch(/task_block.*human/);
  });

  it("docs can be filtered to an agent's available tool set", () => {
    const docs = renderCapabilityDocs(["task_block", "memory_search"]);
    expect(docs).toContain("`task_block`");
    expect(docs).toContain("`memory_search`");
    expect(docs).not.toContain("`task_create`");
  });
});

describe("zodToJsonSchema (registry → native tool schemas, P8)", () => {
  it("maps primitives, enums, arrays, and nested objects", () => {
    const shape = z.object({
      s: z.string().describe("a string"),
      n: z.number().int(),
      f: z.number(),
      b: z.boolean(),
      e: z.enum(["a", "b"]),
      arr: z.array(z.string()),
      obj: z.object({ inner: z.string() }),
    });
    const js = zodToJsonSchema(shape);
    expect(js.type).toBe("object");
    expect(js.properties!.s).toEqual({ type: "string", description: "a string" });
    expect(js.properties!.n).toEqual({ type: "integer" });
    expect(js.properties!.f).toEqual({ type: "number" });
    expect(js.properties!.b).toEqual({ type: "boolean" });
    expect(js.properties!.e).toEqual({ type: "string", enum: ["a", "b"] });
    expect(js.properties!.arr).toEqual({ type: "array", items: { type: "string" } });
    expect(js.properties!.obj!.type).toBe("object");
    expect(js.additionalProperties).toBe(false);
  });

  it("optional and default fields are not required; the rest are", () => {
    const shape = z.object({
      req: z.string(),
      opt: z.string().optional(),
      def: z.number().default(1),
    });
    const js = zodToJsonSchema(shape);
    expect(js.required).toEqual(["req"]);
    expect(js.properties!.opt).toEqual({ type: "string" });
    expect(js.properties!.def).toEqual({ type: "number" });
  });
});

describe("nativeToolSchemas (direct-API surface mirrors the registry)", () => {
  it("emits one schema per registry capability, JSON-Schema shaped", () => {
    const schemas = nativeToolSchemas(null);
    expect(schemas.map((s) => s.name).sort()).toEqual(AGENT_CAPABILITIES.map((c) => c.name).sort());
    const taskBlock = schemas.find((s) => s.name === "task_block")!;
    expect(taskBlock.inputSchema.type).toBe("object");
    expect(taskBlock.inputSchema.required).toContain("questions");
    expect(taskBlock.inputSchema.required).not.toContain("taskId");
    expect(taskBlock.inputSchema.properties!.questions!.type).toBe("array");
  });

  it("honors the effective-tools snapshot (P2 deny-wins + allow-list clamp)", () => {
    const denied: EffectiveTools = { allowed: [], disallowed: ["spawn_subtask"] };
    expect(nativeToolSchemas(denied).map((s) => s.name)).not.toContain("spawn_subtask");

    const onlyBlock: EffectiveTools = { allowed: ["task_block"], disallowed: [] };
    expect(nativeToolSchemas(onlyBlock).map((s) => s.name)).toEqual(["task_block"]);
  });
});

describe("dispatchCapability (in-process, degrades like MCP — never a hard throw)", () => {
  const ctx = { runId: "run_x", taskId: null } as unknown as RunContext;

  it("returns an isError result for an unknown tool", async () => {
    const res = await dispatchCapability("does_not_exist", {}, ctx);
    expect(res.isError).toBe(true);
    expect(toolResultText(res)).toMatch(/unknown tool/);
  });

  it("refuses a clamped-away tool without invoking its handler", async () => {
    const clamp: EffectiveTools = { allowed: [], disallowed: ["task_block"] };
    const res = await dispatchCapability("task_block", { questions: [{ question: "x?" }] }, ctx, clamp);
    expect(res.isError).toBe(true);
    expect(toolResultText(res)).toMatch(/not permitted/);
  });

  it("surfaces a handler error (no task context) as isError, not a throw", async () => {
    const res = await dispatchCapability("task_block", { questions: [{ question: "x?" }] }, ctx, null);
    expect(res.isError).toBe(true);
  });
});
