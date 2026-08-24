"use client";

// Under `/tasks`, not `/goals`. The plan's bullet says "goals"; the router and
// `goal-detail.tsx` both say `/tasks/goals/$goalId`, and `tasks.tsx` links
// there. A page at `/goals/[goalId]` would render correctly and be reachable
// from nothing.
import { GoalDetailPage } from "./goal-detail";

export default function Page() {
  return <GoalDetailPage />;
}
