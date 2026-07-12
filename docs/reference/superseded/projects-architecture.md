# Projects Architecture & Execution Plan (Phase 3)

This document outlines the technical architecture for the **Projects** module, which serves as the core execution boundary for the Sparstrowgen factory.

## 1. Directory & Codebase Binding
**Vision:** A Project is not just a logical grouping; it is physically bound to a specific codebase or directory on the host machine where agents perform their work.

**Technical Implementation:**
- **The `rootDir` enforcement:** The `projects` table already has a `rootDir` column. We will enforce that *every* CLI process or API execution triggered for a Project-scoped task strictly sets its current working directory (CWD) to this `rootDir`. Agents cannot operate outside of this boundary.
- **Git Awareness:** Projects will feature native Git integration. The UI will display the current branch, uncommitted changes, and recent commits for the `rootDir` directly on the Project Dashboard, so you always know the exact state of the codebase the agents are touching.

## 2. Project Memory & Auto-Indexing
**Vision:** Projects must maintain deep, semantic context about their codebase so agents don't have to re-read the entire repo every time they wake up.

**Technical Implementation:**
- **Auto-Indexing:** When a Project is created (or manually refreshed), a background task will crawl the `rootDir`, generate summaries of key architecture files, and inject them into the `memoryNotes` table under the `project` scope.
- **Human Guidance:** You can manually add "Project Directives" (e.g., "Always use Tailwind for styling in this project") to the Project Memory. These are guaranteed to be injected into every agent's prompt when they work on this project.

## 3. Tool Permission Overrides (From Phase 1)
**Vision:** Projects act as the middle layer of the security hierarchy.

**Technical Implementation:**
- **Schema Upgrades:** As agreed in Phase 1, we will add `allowedTools` and `disallowedTools` to the `projects` table.
- **Runtime Overrides:** If the Global config allows `Web Search`, but a specific Project disallows it, no agent working on that Project can use the tool, regardless of their own individual agent configuration.

## 4. UI & Core Feature Parity (Claude Cowork Inspiration)
**Vision:** The Projects UI will inherit the minimalist, dark-themed aesthetic of Claude Cowork, while serving as the central hub for all project-level entities.

**Technical Implementation:**
- **The Projects Index (Grid View):** A clean grid of Project Cards displaying the project name, the physical `rootDir` path, and a "last updated" timestamp. 
- **Project Creation Modal:** When you click "New Project," a modal will offer three pathways:
  1. **Start from scratch:** Creates a brand new empty folder and initializes a project.
  2. **Use an existing folder:** Binds an existing local codebase.
  3. **Import from GitHub:** Clones a public repository into a new project.
- **The Project Workspace (Detail View):**
  - **Main Stage:** A centralized input bar to instantly launch a new task ("What would you like to work on in this project?") with a model/agent selector. Below this, a unified feed displaying recent tasks, assigned agents, assigned teams, and generated artifacts.
  - **Right Sidebar (Context Panels):** A persistent sidebar with collapsible panels for:
    - **Instructions/Directives:** Project-level rules.
    - **Memory:** Auto-indexed `memoryNotes`.
    - **Scheduled Tasks:** Cron jobs assigned to this project.
    - **Context (Files/Folders):** A file explorer tree showing the `rootDir` contents.

## 5. Daily Status Dashboard & Observability
**Vision:** You should never have to guess what happened in a project overnight.

**Technical Implementation:**
- **The Project Updating Agent:** A specialized, system-level agent will be automatically bound to every active project via a Cron job. 
- **Morning Briefing:** Every morning, this agent will scan the project's recent task runs, memory updates, and Git commits to generate a concise "Status Update" artifact, placing it prominently on the Project Dashboard.

## 6. The Sandbox Environment (Safe Import)
**Vision:** Importing external codebases or unknown folders should not pollute your production memory or give rogue agents access to sensitive data.

**Technical Implementation:**
- **Import Interception:** When you select "Use an existing folder" or "Import from GitHub," the UI will prompt: *"Do you want to open this project in a Sandbox Environment?"*
- **Sandbox Isolation:** If YES is selected:
  - The project is flagged as `is_sandbox = true`.
  - Agents operating within this project are forced into a dedicated, ephemeral memory layer.
  - Any architectural insights, notes, or code extracted by the agents cannot be written to the Global Production Memory unless you explicitly promote them.

## 7. Client Variants & Subprojects (White Labeling)
**Vision:** Sparstrowgen is built to launch core products (like the VitalHIS clinic app or base ERP) and then seamlessly spin off customized, client-specific versions without losing the connection to the base application.

**Technical Implementation:**
- **Schema Upgrades (The Forking Model):** We will add a `parent_project_id` column to the `projects` table. This allows any project to act as a "Subproject" or "Client Variant" of a core project.
- **The Duplicate Workflow:**
  - The UI will feature a **"Create Client Variant"** button on base projects.
  - Clicking this will execute a true fork: it clones the base project's Git repository into a new folder, duplicates the base project's foundational Memory Notes, and creates a new `project` record linked via `parent_project_id`.
- **UI Organization:** In the Projects Grid, base projects will feature a nested "Client Variants" tab. This keeps your client roster (e.g., Jameel ERP, Seelin ERP) neatly organized under the core engine rather than cluttering the root view.
- **Memory Isolation:** While the client variant starts with a copy of the base memory, it maintains its own isolated `memoryNotes` layer. This ensures that a custom business logic rule built for Clinic A does not accidentally bleed back into the core product or affect Clinic B.
- **Downstream Code Flow (Task-Based Sync):** When the base project receives an update, it does *not* automatically merge into the client variants. Instead, you can trigger a **"Sync from Base"** action on the client variant's dashboard. This spawns a specific task for an agent to manually review the upstream changes and apply them safely, ensuring custom client code is never blindly overwritten.
