import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getSqlite, openDb } from "./connection.js";
import { chatMessages, chatSessions } from "./schema.js";

const ts = "2026-01-01T00:00:00Z";

describe("migration 0013 — chat sessions", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    closeDb();
    db = openDb(":memory:").db;
  });
  afterEach(() => closeDb());

  it("applies the chain through 0013 and passes foreign_key_check", () => {
    const applied = (getSqlite().prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (r) => r.id,
    );
    expect(applied).toContain("0013_chat_sessions");
    expect(getSqlite().prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const sessionCols = (
      getSqlite().prepare("PRAGMA table_info(chat_sessions)").all() as { name: string }[]
    ).map((c) => c.name);
    for (const col of ["kind", "title", "project_id", "agent_id", "provider", "model", "status", "draft", "last_message_at"]) {
      expect(sessionCols).toContain(col);
    }

    const messageCols = (
      getSqlite().prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[]
    ).map((c) => c.name);
    for (const col of ["session_id", "role", "content", "meta"]) {
      expect(messageCols).toContain(col);
    }

    const sessionIndexes = (
      getSqlite().prepare("PRAGMA index_list(chat_sessions)").all() as { name: string }[]
    ).map((i) => i.name);
    expect(sessionIndexes).toContain("idx_chat_sessions_kind");
    expect(sessionIndexes).toContain("idx_chat_sessions_project");

    const messageIndexes = (
      getSqlite().prepare("PRAGMA index_list(chat_messages)").all() as { name: string }[]
    ).map((i) => i.name);
    expect(messageIndexes).toContain("idx_chat_messages_session");
  });

  it("cascades messages when their session is deleted", () => {
    db.insert(chatSessions)
      .values({ id: "chs_1", kind: "free", createdAt: ts, updatedAt: ts })
      .run();
    db.insert(chatMessages)
      .values({ id: "chm_1", sessionId: "chs_1", role: "user", content: "hi", createdAt: ts })
      .run();

    db.delete(chatSessions).where(eq(chatSessions.id, "chs_1")).run();
    const left = db.select().from(chatMessages).all();
    expect(left).toHaveLength(0);
  });

  it("round-trips the JSON draft column", () => {
    db.insert(chatSessions)
      .values({
        id: "chs_2",
        kind: "agent-creator",
        draft: { name: "reviewer", provider: "claude-code" },
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    const row = db.select().from(chatSessions).where(eq(chatSessions.id, "chs_2")).get()!;
    expect(row.draft).toEqual({ name: "reviewer", provider: "claude-code" });
  });
});
