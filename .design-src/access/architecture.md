> [!WARNING]
> **FUTURE VISION ONLY — DO NOT IMPLEMENT YET**
> This Phase 6 architecture outlines the future transition to a multi-user cloud model (Vercel/Supabase). It must be *considered* when structuring databases or API boundaries during Phases 1-5, but it should **not** be built right now. The factory currently remains a single-user, local SQLite application.

# Multi-User & Access Control Architecture (Phase 6)

This document outlines the technical architecture for **Phase 6**, transforming Sparstrowgen from a single-player, local SQLite factory into a multi-user, multi-tenant enterprise cloud system.

## 1. Cloud Transition (Vercel & Supabase)
**Vision:** To support remote sales and marketing teams, Sparstrowgen must shift from a local desktop tool to a globally accessible web application.
**Technical Implementation:**
- **Database Engine:** The local SQLite database will be migrated to **Supabase (PostgreSQL)**. 
- **Authentication:** **Supabase Auth** will handle all user sessions, RBAC (Role-Based Access Control), and Row-Level Security (RLS) to ensure users can only see their own data.
- **Storage:** File storage (for artifacts, logs, and memory dumps) will move to Supabase Storage.
- **Deployment:** The Sparstrowgen Factory web UI will be deployed to **Vercel**.

## 2. Role-Based Access Control (RBAC)
**Vision:** Users must be strictly boxed into their roles. A salesperson should not be able to accidentally edit a core agent or view the base VitalHIS source code.

**Permission Matrix:**
- **`owner` (You):** Absolute control. Can view base repos, modify base agents, access global factory memory, and deploy anything.
- **`staff` (Sales/Marketing):**
  - **Cannot:** Create/edit base agents, access global factory memory, or access the base parent repos (like VitalHIS).
  - **Can:** Fork a base repo into a client-specific subproject.
  - **Can:** Talk to the *copied* Planning Agents to customize the subproject.
  - **Can:** Deploy the subproject to a staging environment for testing.
  - **Can:** Push the subproject to production once approved for their specific client.

## 3. The Deep-Fork Workflow (Subprojects, Agents & Memory)
**Vision:** When a salesperson forks a project for a new client (e.g., Clinic A), they aren't just cloning source code. They are cloning the *entire brain* of the project so the new agents immediately understand the core VitalHIS architecture.

**Technical Implementation:**
When a `staff` user clicks "New Client Project (Fork VitalHIS)":
1. **Source Code Clone:** The main VitalHIS repository is cloned into a new isolated subproject (e.g., `VitalHIS-ClinicA`).
2. **Agent Cloning:** The system performs a **deep copy of the Agents** assigned to VitalHIS. The salesperson does not use the "global" agents; they get their own dedicated copies of the Planning and Execution agents.
3. **Memory Cloning:** The system performs a **deep copy of the Parent Memory**. The newly copied agents are handed a complete, duplicated copy of the VitalHIS knowledge graph, task history, and design decisions. 
4. **Isolation:** Because the agents and memory are physical *copies*, as the salesperson customizes `ClinicA`, the new memories and edge cases generated will **only** exist in ClinicA's database. They will never bleed upstream into the parent VitalHIS repo or into Clinic B's repo.
