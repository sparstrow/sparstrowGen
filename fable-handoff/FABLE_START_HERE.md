# Claude Fable Handoff: Sparstrowgen AI Factory

Welcome, Claude Fable. You are tasked with implementing **Sparstrowgen**, a local-first, single-user AI agent factory designed to build, test, and manage software products. 

The human (Owner) acts as the solo developer. Your job is to take these architectural blueprints and **first create a detailed engineering plan for approval**. Do not straight away build it out. Once the human approves your engineering plan, you will begin implementation.

## 1. Core Stack & Constraints
- **Frontend:** React, Vite, TailwindCSS (vibrant, dark mode, glassmorphism).
- **Backend:** Node.js, Fastify, `better-sqlite3`, Drizzle ORM.
- **Environment:** Local desktop app (Electron wrapper planned later). Runs on `127.0.0.1:48750`.
- **Constraint:** DO NOT implement cloud infrastructure (Vercel/Supabase) or Multi-User Authentication. This is currently a single-user local application. Phase 6 (Cloud/Multi-user) is strictly for architectural foresight so you don't paint the DB schema into a corner.

## 2. The Architecture (6 Phases)
The full specifications are stored in `C:\Sparstrow\Sparstrowgen\.design-src\`. Here is the high-level summary:

### Phase 1 & 2: Agents & Teams (The Hive Mind)
- We do not use single monolithic agents. We use **Swarms**.
- **Manager Agent:** The user chats with a Manager. The Manager breaks down the request into an execution plan.
- **Sub-Agents:** The Manager delegates specific tasks to specialized sub-agents (e.g., Coder, Tester, Reviewer).
- **Escalation Loop:** If sub-agents get stuck, they ask the Manager. If the Manager hallucinates or lacks context, it pauses the graph and pings the Human in the chat UI.

### Phase 3: Projects
- Projects define the workspace. The factory clones template repos (like `VitalHIS`) into local subdirectories. Agents operate strictly within the `rootDir` of the assigned project.

### Phase 4: Execution Engine (GOAP)
- **Reference Repo:** `C:\Sparstrow\temp-ruflo`
- We use **Goal-Oriented Action Planning (GOAP)** extracted from Ruflo.
- The Manager Agent uses an A* algorithm to mathematically map out preconditions and effects for a goal. 
- **Visualization:** This is displayed to the user as a real-time **Visual Dependency Tree (Node Graph)** in the Tasks/Pipelines UI. As agents complete tasks, nodes light up green.
- **Adaptive Replanning:** If a sub-agent fails, the Manager dynamically calculates an alternate A* path.

### Phase 5: Smart Memory
- **Reference Repo 1:** `C:\Sparstrow\temp-graphify`
- **Reference Repo 2:** `C:\Sparstrow\temp-gbrain`
- We do not use dumb, flat grep searches. Memory is a semantic Knowledge Graph.
- **Graphify:** Natively integrated to extract AST and architectural relationships from the codebase.
- **GBrain:** Natively integrated for autonomous memory management.
- **The Dream Cycle:** A nightly background cron job deduplicates overlapping notes, synthesizes knowledge, and flags contradictions. 
- **Passive Signal Detection:** The system passively extracts decisions and pitfalls from agent chat logs and injects them into the typed schema (`Decision`, `Architecture`, `Pitfall`) so agents don't repeat mistakes.

### Phase 6: Cloud Transition (FUTURE ONLY - DO NOT BUILD YET)
- *Foresight only:* In the future, this app will move to Vercel/Supabase for multi-tenant sales teams. Keep the data layer abstracted enough to swap SQLite for Postgres later, and include a `user_id` column structure, but DO NOT build the auth or cloud deployment now.

## 3. How to Proceed
1. **Analyze \u0026 Reorganize:** Read the `C:\Sparstrow\Sparstrowgen\.design-src\APP.md` build board and all architecture specs in `.design-src/`. Do not blindly build "Phase 1" then "Phase 2". Analyze the engineering dependencies and reorganize the tasks logically.
2. **Draft the Execution Plan:** Write a comprehensive engineering plan (e.g., setting up the database schemas first, then the core APIs, then the UI). Add your own context and structure to the plan.
3. **Wait for Approval:** Present this reorganized execution plan to the Owner. **Do not write code until the Owner approves the plan.**
4. **Extract Logic:** Once approved, review the reference repositories (`temp-ruflo`, `temp-graphify`, `temp-gbrain`) to extract specific implementation methods for GOAP, Swarms, and Memory Synthesis.
5. **Build:** Execute your approved plan to build the Fastify APIs, SQLite/Drizzle schemas, and Vite React frontend.
