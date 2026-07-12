> **Reference — superseded.** Pre-dates `fable-handoff/ENGINEERING_PLAN.md` (the actual 10-phase
> plan that got built) and uses a different phase numbering — this doc's "Phase 4" ≠ the real
> P4. Kept for early-thinking history only, not a live plan.

# Execution Engine & Terminals Architecture (Phase 4)

This document outlines the technical architecture for the **Execution Engine** (Phase 4), drawing directly from the North Star `agent-git-automation.md` document. This phase defines how agents interact with the filesystem, write code, and safely export their work.

## 1. The Core Principle: Blast Radius Control
**Vision:** Agents never touch production directly. The entire terminal and execution layer is designed around one concept: if an agent hallucinates or is prompt-injected, the absolute worst thing it can do is open a bad Pull Request.

**Technical Implementation:**
- **`main` is Sacred:** No agent terminal session will ever be allowed to push directly to the `main` or `staging` branches. These branches are protected by GitHub branch rules.
- **Agent Machine User:** All agent git operations will be authored by `agent@sparstrow.com` using a scoped, fine-grained Personal Access Token (PAT).
- **Secret Isolation:** Deploy secrets (like Vercel tokens or Supabase service keys) live exclusively in CI/CD (GitHub Actions or Vercel). They are **never** injected into the agent's local terminal environment. 

## 2. The Execution Profiles
The Run Engine will automatically detect which type of project the agent is working on and enforce the appropriate Git flow.

### Profile A: Factory (Internal Tools like Sparstrowgen)
- **Flow:** Agent Terminal (checkout branch) → Code changes → Commit → Push Branch → Open PR targeting `main`.
- **Gate:** GitHub Actions runs `typecheck` + `test`. You manually review and merge.

### Profile B: Production Apps (Shelfree, Seelin, VitalHIS)
- **Flow:** Agent Terminal (checkout branch) → Code changes → Commit → Push Branch → Open PR targeting `staging`.
- **Gate 1:** Vercel automatically generates a Preview URL for the PR. You review the isolated change.
- **Gate 2:** You merge the PR into `staging`. Vercel deploys to the test environment with a test database. You perform QA.
- **Gate 3:** You manually promote `staging` to `main` to deploy to production.

## 3. Orchestrator-Mediated Push (The Sandbox Evolution)
**Vision:** Currently, the agent terminal has access to the PAT to run `git push`. In the future, the agent will not even have push access.

**Technical Implementation:**
- **Phase 1 (Now):** The agent runs `git push` directly in the terminal using the injected PAT.
- **Phase 2 (Later):** The agent terminal is completely isolated from the network. It can only `git commit` locally. When the task is marked `done`, the Sparstrowgen Orchestrator (which runs outside the agent sandbox) takes over, pushes the branch, and opens the PR via the GitHub API.

## 4. Branch Protection (GitHub Free Plan)
**Vision:** Maintain zero-cost infrastructure until revenue justifies an upgrade.

**Technical Implementation:**
- **Advisory Protection:** We will remain on the GitHub Free plan. Branch Protection rules on `main` will be configured as "advisory."
- **Human Discipline Gate:** Since the protection cannot be strictly enforced without the paid Team plan, you must rely on discipline to never manually merge a PR that has failing CI checks.
- **Upgrade Trigger:** We will upgrade to the paid GitHub Team plan when the first human employee is hired or when agents become completely autonomous (Phase 2 Push).

## 5. Goal-Oriented Action Planning (GOAP)
**Vision:** A true factory needs an engineering manager. It should take a plain-English goal and explicitly map out the steps before anyone writes code.
**Technical Implementation:**
- We will integrate a **GOAP Engine**. When you assign a high-level task (*"Build the memory settings page"*), the Orchestrator first runs an A* search algorithm to decompose it into a visual tree of preconditions and actions.
- **Adaptive Replanning:** If an agent fails to compile a component, the Orchestrator dynamically re-runs the A* pathfinder from the new failed state to find an alternate route to success.

## 6. Swarm Coordination (The Hive Mind)
**Vision:** Complex features require different specialties.
**Technical Implementation:**
- Instead of a single monolithic agent, the GOAP engine will spawn **Swarms**.
- The Orchestrator acts as the "Queen", delegating parallel tasks to specialized sub-agents (e.g., a UI Coder, a Backend Coder, and a Security Reviewer). 
- The Queen enforces consensus before the final Git commit is pushed to the staging branch.

## 7. Visualization (The Node Graph)
**Vision:** You need complete transparency into what the swarm is thinking and doing at any given moment. 
**Technical Implementation:** The Tasks UI will feature a **Visual Dependency Tree (Node Graph)**. Instead of a simple Kanban board, you will see a flowchart of the GOAP tree. You will see exactly what preconditions are blocking what actions, and nodes will light up green in real-time as agents complete them, giving you a god's-eye view of the swarm's thought process.
