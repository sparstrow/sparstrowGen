import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fastify from "fastify";
import { eq } from "drizzle-orm";
import { closeDb, openDb } from "../../db/connection.js";
import { agents, agentSkills, skills } from "../../db/schema.js";
import { skillRoutes } from "./skills.js";
import { buildSkillsBlock, setSkillsForAgent } from "../../agents/agent-skills.js";

const ts = "2024-01-01T00:00:00Z";

function seedAgent(db: ReturnType<typeof openDb>["db"], id = "agt_1") {
  db.insert(agents)
    .values({
      id,
      name: `Agent ${id}`,
      slug: `agent-${id}`,
      provider: "test",
      model: "test",
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
}

describe("Skills schema", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("enforces UNIQUE skill names", () => {
    db.insert(skills).values({ id: "skl_1", name: "PDF", createdAt: ts, updatedAt: ts }).run();
    expect(() =>
      db.insert(skills).values({ id: "skl_2", name: "PDF", createdAt: ts, updatedAt: ts }).run(),
    ).toThrow();
  });

  it("cascades skill and agent deletion to assignments", () => {
    seedAgent(db);
    db.insert(skills).values({ id: "skl_1", name: "PDF", createdAt: ts, updatedAt: ts }).run();
    db.insert(agentSkills).values({ agentId: "agt_1", skillId: "skl_1" }).run();

    db.delete(skills).where(eq(skills.id, "skl_1")).run();
    expect(db.select().from(agentSkills).all().length).toBe(0);

    db.insert(skills).values({ id: "skl_2", name: "Web", createdAt: ts, updatedAt: ts }).run();
    db.insert(agentSkills).values({ agentId: "agt_1", skillId: "skl_2" }).run();
    db.delete(agents).where(eq(agents.id, "agt_1")).run();
    expect(db.select().from(agentSkills).all().length).toBe(0);
  });
});

describe("buildSkillsBlock", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
    seedAgent(db);
  });
  afterEach(() => closeDb());

  it("returns empty string when the agent has no skills", () => {
    expect(buildSkillsBlock("agt_1")).toBe("");
  });

  it("renders assigned enabled skills with name, description, and content", () => {
    db.insert(skills)
      .values({
        id: "skl_1",
        name: "PDF handling",
        description: "Work with PDF files.",
        content: "Always use pypdf. Never shell out to ghostscript.",
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    setSkillsForAgent("agt_1", ["skl_1"]);

    const block = buildSkillsBlock("agt_1");
    expect(block).toContain("## Skills");
    expect(block).toContain("### Skill: PDF handling");
    expect(block).toContain("Work with PDF files.");
    expect(block).toContain("Always use pypdf.");
  });

  it("skips disabled skills even when assigned", () => {
    db.insert(skills)
      .values({ id: "skl_1", name: "Off", enabled: false, content: "secret sauce", createdAt: ts, updatedAt: ts })
      .run();
    setSkillsForAgent("agt_1", ["skl_1"]);
    expect(buildSkillsBlock("agt_1")).toBe("");
  });

  it("setSkillsForAgent replaces the set atomically and rejects unknown ids", () => {
    db.insert(skills).values({ id: "skl_1", name: "A", createdAt: ts, updatedAt: ts }).run();
    db.insert(skills).values({ id: "skl_2", name: "B", createdAt: ts, updatedAt: ts }).run();
    setSkillsForAgent("agt_1", ["skl_1", "skl_2"]);
    expect(setSkillsForAgent("agt_1", ["skl_2"]).map((s) => s.id)).toEqual(["skl_2"]);
    expect(() => setSkillsForAgent("agt_1", ["skl_missing"])).toThrow(/unknown skill/);
    // A failed set must not have wiped the previous assignment.
    expect(db.select().from(agentSkills).all().length).toBe(1);
  });
});

describe("Skill routes", () => {
  let db: ReturnType<typeof openDb>["db"];
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    closeDb();
    db = openDb(":memory:").db;
    app = fastify();
    app.setErrorHandler((error: any, _request: any, reply: any) => {
      const err = error as any;
      if (err.name === "ZodError" || err.code === "FST_ERR_VALIDATION") {
        reply.status(400).send({ message: "Validation error" });
      } else {
        reply.status(err.statusCode || 500).send({ message: err.message });
      }
    });
    await app.register(skillRoutes);
    seedAgent(db);
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it("creates, lists, updates, and deletes a skill", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/skills",
      payload: { name: "Web research", description: "Search well", content: "Use 3 sources." },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.name).toBe("Web research");
    expect(skill.enabled).toBe(true);

    const list = await app.inject({ method: "GET", url: "/skills" });
    expect(list.json().length).toBe(1);

    const updated = await app.inject({
      method: "PUT",
      url: `/skills/${skill.id}`,
      payload: { enabled: false },
    });
    expect(updated.json().enabled).toBe(false);

    const del = await app.inject({ method: "DELETE", url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/skills" })).json().length).toBe(0);
  });

  it("rejects duplicate names on create and rename", async () => {
    await app.inject({ method: "POST", url: "/skills", payload: { name: "One" } });
    const dup = await app.inject({ method: "POST", url: "/skills", payload: { name: "One" } });
    expect(dup.statusCode).toBe(409);

    const two = (await app.inject({ method: "POST", url: "/skills", payload: { name: "Two" } })).json();
    const rename = await app.inject({
      method: "PUT",
      url: `/skills/${two.id}`,
      payload: { name: "One" },
    });
    expect(rename.statusCode).toBe(409);
  });

  it("assigns and reads back an agent's skills", async () => {
    const a = (await app.inject({ method: "POST", url: "/skills", payload: { name: "A" } })).json();
    const b = (await app.inject({ method: "POST", url: "/skills", payload: { name: "B" } })).json();

    const set = await app.inject({
      method: "PUT",
      url: "/agents/agt_1/skills",
      payload: { skillIds: [b.id, a.id] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().map((s: { name: string }) => s.name)).toEqual(["A", "B"]);

    const got = await app.inject({ method: "GET", url: "/agents/agt_1/skills" });
    expect(got.json().length).toBe(2);

    const pairs = await app.inject({ method: "GET", url: "/skills/assignments" });
    expect(pairs.json().length).toBe(2);

    const badAgent = await app.inject({
      method: "PUT",
      url: "/agents/agt_missing/skills",
      payload: { skillIds: [] },
    });
    expect(badAgent.statusCode).toBe(404);

    const badSkill = await app.inject({
      method: "PUT",
      url: "/agents/agt_1/skills",
      payload: { skillIds: ["skl_nope"] },
    });
    expect(badSkill.statusCode).toBe(400);
  });
});
