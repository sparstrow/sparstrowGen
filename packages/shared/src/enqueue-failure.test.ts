import { describe, expect, it } from "vitest";
import { chatTurnFailureFrom, enqueueFailureFrom } from "./enqueue-failure";

/** Shaped like a PostgREST error: the SQLSTATE arrives as `code`. */
const pgError = (code: string, message = "boom") => ({ code, message, details: null, hint: null });

describe("enqueueFailureFrom", () => {
  it("maps every SQLSTATE start_run raises", () => {
    expect(enqueueFailureFrom(pgError("SPG10"))?.reason).toBe("agent_not_found");
    expect(enqueueFailureFrom(pgError("SPG11"))?.reason).toBe("agent_disabled");
    expect(enqueueFailureFrom(pgError("SPG12"))?.reason).toBe("no_runtime_available");
    expect(enqueueFailureFrom(pgError("SPG13"))?.reason).toBe("project_not_available");
    expect(enqueueFailureFrom(pgError("SPG14"))?.reason).toBe("project_not_found");
    expect(enqueueFailureFrom(pgError("SPG15"))?.reason).toBe("run_not_found");
  });

  it("keeps 'no machine online' and 'no machine has the project' distinct", () => {
    // They lead to completely different offers in the UI — start a machine
    // versus relink/clone/reassign. Collapsing them into one error would make
    // the message useless exactly when the user needs it.
    const noRuntime = enqueueFailureFrom(pgError("SPG12"));
    const noProject = enqueueFailureFrom(pgError("SPG13"));
    expect(noRuntime?.reason).not.toBe(noProject?.reason);
  });

  it("uses 404 for things that do not exist and 409 for things that cannot run now", () => {
    expect(enqueueFailureFrom(pgError("SPG10"))?.status).toBe(404);
    expect(enqueueFailureFrom(pgError("SPG14"))?.status).toBe(404);
    expect(enqueueFailureFrom(pgError("SPG11"))?.status).toBe(409);
    expect(enqueueFailureFrom(pgError("SPG12"))?.status).toBe(409);
    expect(enqueueFailureFrom(pgError("SPG13"))?.status).toBe(409);
  });

  it("passes the database's own message through", () => {
    // Written for a person in the RAISE, e.g. "No machine is online that can
    // run claude-code." A second copy here would drift from the first.
    const failure = enqueueFailureFrom(pgError("SPG12", "No machine is online that can run claude-code."));
    expect(failure?.message).toBe("No machine is online that can run claude-code.");
  });

  it("falls back to a usable message when the error carries none", () => {
    expect(enqueueFailureFrom({ code: "SPG12", message: "   " })?.message).toBe(
      "That run could not be started.",
    );
  });

  it("returns null for anything it does not recognise, so the caller rethrows", () => {
    // The important one. A connection failure laundered into a tidy 409 sends
    // the user to check their machines over a bug on the server.
    expect(enqueueFailureFrom(pgError("08006", "connection failure"))).toBeNull();
    expect(enqueueFailureFrom(pgError("23505", "duplicate key"))).toBeNull();
    expect(enqueueFailureFrom(new Error("TypeError: undefined is not a function"))).toBeNull();
    expect(enqueueFailureFrom(null)).toBeNull();
    expect(enqueueFailureFrom(undefined)).toBeNull();
    expect(enqueueFailureFrom("SPG12")).toBeNull();
    expect(enqueueFailureFrom({ code: 12 })).toBeNull();
  });

  it("does not mistake M3's pairing codes for dispatch failures", () => {
    // 008 owns SPG01-03. If those ever mapped here, a pairing bug would be
    // reported as a dispatch problem.
    for (const code of ["SPG01", "SPG02", "SPG03"]) {
      expect(enqueueFailureFrom(pgError(code))).toBeNull();
    }
  });
});

describe("chatTurnFailureFrom", () => {
  it("maps every SQLSTATE enqueue_chat_turn / retry_chat_turn raise", () => {
    expect(chatTurnFailureFrom(pgError("SPG16"))?.reason).toBe("turn_in_progress");
    expect(chatTurnFailureFrom(pgError("SPG17"))?.reason).toBe("session_not_found");
    expect(chatTurnFailureFrom(pgError("SPG18"))?.reason).toBe("turn_not_found");
    expect(chatTurnFailureFrom(pgError("SPG19"))?.reason).toBe("turn_not_retryable");
  });

  it("is 409 for 'exists but not runnable now', 404 for 'does not exist'", () => {
    expect(chatTurnFailureFrom(pgError("SPG16"))?.status).toBe(409);
    expect(chatTurnFailureFrom(pgError("SPG19"))?.status).toBe(409);
    expect(chatTurnFailureFrom(pgError("SPG17"))?.status).toBe(404);
    expect(chatTurnFailureFrom(pgError("SPG18"))?.status).toBe(404);
  });

  it("passes the database's own message through", () => {
    const failure = chatTurnFailureFrom(
      pgError("SPG16", "This session already has a reply in progress."),
    );
    expect(failure?.message).toBe("This session already has a reply in progress.");
  });

  it("falls back to a usable message when the error carries none", () => {
    expect(chatTurnFailureFrom({ code: "SPG16", message: "   " })?.message).toBe(
      "That chat turn could not be sent.",
    );
  });

  it("returns null for anything it does not recognise, so the caller rethrows", () => {
    expect(chatTurnFailureFrom(pgError("08006", "connection failure"))).toBeNull();
    expect(chatTurnFailureFrom(pgError("23505", "duplicate key"))).toBeNull();
    expect(chatTurnFailureFrom(new Error("TypeError: undefined is not a function"))).toBeNull();
    expect(chatTurnFailureFrom(null)).toBeNull();
    expect(chatTurnFailureFrom(undefined)).toBeNull();
    expect(chatTurnFailureFrom("SPG16")).toBeNull();
    expect(chatTurnFailureFrom({ code: 12 })).toBeNull();
  });

  it("does not mistake start_run's dispatch codes for chat-turn failures", () => {
    // 009 owns SPG10-15. If those ever mapped here, a run-dispatch bug would
    // be reported as a chat problem.
    for (const code of ["SPG10", "SPG11", "SPG12", "SPG13", "SPG14", "SPG15"]) {
      expect(chatTurnFailureFrom(pgError(code))).toBeNull();
    }
  });
});
