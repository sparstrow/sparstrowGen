/**
 * buildWakePrompt (DX-C1) — the self-contained note handed to a freshly-spawned
 * run when a blocked task is answered. Fresh-run is the PRIMARY wake path (P1-Q1),
 * so the woken process has NO memory of blocking: this note must restate the task,
 * the exact questions asked, the operator's answers, and the agent's own partial
 * progress. Pure function + golden tests, mirroring renderSkillMd discipline.
 */
export interface WakePromptInput {
  taskTitle: string;
  taskDescription: string;
  answeredQuestions: { question: string; answer: string }[];
  progressNote?: string | null;
}

export function buildWakePrompt(input: WakePromptInput): string {
  const { taskTitle, taskDescription, answeredQuestions, progressNote } = input;
  const lines: string[] = [
    "## Resuming blocked work",
    "",
    `You previously blocked this task to ask the operator. It is now unblocked — continue from where you left off; do not start over or re-ask what is already answered below.`,
    "",
    "### Original task",
    `# ${taskTitle}`,
  ];
  if (taskDescription.trim().length > 0) lines.push(taskDescription.trim());

  lines.push("", "### Your questions and the operator's answers");
  if (answeredQuestions.length === 0) {
    lines.push("(no recorded questions)");
  } else {
    answeredQuestions.forEach((qa, i) => {
      lines.push(`${i + 1}. Q: ${qa.question}`, `   A: ${qa.answer}`);
    });
  }

  lines.push(
    "",
    "### Your progress before blocking",
    progressNote && progressNote.trim().length > 0 ? progressNote.trim() : "(none recorded)",
    "",
    "Continue the task now. When finished, call task_update with a result summary.",
  );
  return lines.join("\n");
}

/**
 * buildChildrenWakePrompt (P3, same DX-C1 discipline as buildWakePrompt) — the
 * self-contained note handed to a lead's fresh run when every delegated child has
 * reached a terminal status. Fresh-run is the primary wake path, so the woken lead
 * has NO memory of delegating: restate the lead's own task, then each child's
 * outcome verbatim, then what to do next.
 */
export interface ChildOutcome {
  taskId: string;
  title: string;
  /** Terminal status the child reached ("done" | "failed"). */
  status: string;
  assignedAgentName: string | null;
  /** The child's result summary (or denial/failure reason). */
  result: string | null;
}

export interface ChildrenWakePromptInput {
  taskTitle: string;
  taskDescription: string;
  children: ChildOutcome[];
  /** The lead's own partial-progress note from before it suspended, if any. */
  progressNote?: string | null;
}

export function buildChildrenWakePrompt(input: ChildrenWakePromptInput): string {
  const { taskTitle, taskDescription, children, progressNote } = input;
  const lines: string[] = [
    "## Resuming after delegation",
    "",
    "You previously delegated part of this task to other agents and suspended. Every delegated subtask has now finished — their outcomes are below. Continue from where you left off; do not re-do or re-delegate work that is already done.",
    "",
    "### Your task",
    `# ${taskTitle}`,
  ];
  if (taskDescription.trim().length > 0) lines.push(taskDescription.trim());

  lines.push("", "### Delegated subtask outcomes");
  if (children.length === 0) {
    lines.push("(no recorded children)");
  } else {
    children.forEach((c, i) => {
      const who = c.assignedAgentName ? ` — ${c.assignedAgentName}` : "";
      lines.push(
        `${i + 1}. [${c.status}] ${c.title} (${c.taskId}${who})`,
        `   Result: ${c.result && c.result.trim().length > 0 ? c.result.trim() : "(none reported)"}`,
      );
    });
  }

  lines.push(
    "",
    "### Your progress before suspending",
    progressNote && progressNote.trim().length > 0 ? progressNote.trim() : "(none recorded)",
    "",
    "Synthesize the children's results and finish your task now. If a child failed and its work is essential, either handle it yourself, re-delegate with a sharper brief via spawn_subtask, or escalate via task_block. When finished, call task_update with a result summary.",
  );
  return lines.join("\n");
}
