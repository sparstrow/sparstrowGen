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
