import { expect, test } from "vitest";
import { toCamel, toSnake, OPAQUE_COLUMNS } from "./case";

test("toCamel converts keys", () => {
  expect(toCamel({ created_at: 1 })).toEqual({ createdAt: 1 });
});

test("run_events payload round trip is byte-identical", () => {
  const original = {
    id: "123",
    created_at: "2024-01-01T00:00:00Z",
    payload: { message: { content: [{ type: "tool_use", name: "x" }] } }
  };
  
  const camel = toCamel(original, OPAQUE_COLUMNS.run_events as string[]);
  
  // The payload should be unmodified
  expect(camel.payload).toEqual({ message: { content: [{ type: "tool_use", name: "x" }] } });
  
  const snake = toSnake(camel, OPAQUE_COLUMNS.run_events as string[]);
  
  expect(snake).toEqual(original);
});

test("runs.injected_memory keys are not snake-cased on write", () => {
  const original = {
    injectedMemory: { notes: [{ projectSlug: "test" }] }
  };
  
  const snake = toSnake(original, OPAQUE_COLUMNS.runs as string[]);
  
  expect(snake.injected_memory).toBeDefined();
  expect(snake.injected_memory.notes[0].projectSlug).toBe("test");
});
