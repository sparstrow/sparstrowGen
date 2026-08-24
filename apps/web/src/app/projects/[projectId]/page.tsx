"use client";

// The module is `project-detail`; the component it exports is
// `ProjectWorkspacePage`. The two disagree, and the import fails to resolve if
// the name is guessed from the filename.
import { ProjectWorkspacePage } from "./project-detail";

export default function Page() {
  return <ProjectWorkspacePage />;
}
