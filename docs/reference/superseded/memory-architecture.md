# Memory Architecture (Phase 5)

This document outlines the technical architecture for the **Memory Module** (Phase 5). Memory in Sparstrowgen is how agents maintain context over time without having to re-read the entire codebase on every task.

## 1. The Knowledge Graph (Graphify Integration)
**Vision:** Instead of flat text summaries, Sparstrowgen will use deep semantic Knowledge Graphs to map out codebases, documents, and dependencies, allowing agents to instantly query architectural relationships.

**Technical Implementation:**
- **Graphify Engine:** We will natively integrate [Graphify](https://github.com/safishamsi/graphify) into the Sparstrowgen Project workspace. 
- **Version Pinning (Controlled Updates):** We will install Graphify as an external dependency but explicitly **pin the version** (e.g., `uv tool install graphifyy==X.Y.Z`). Sparstrowgen will never auto-update this tool. When a new version is released, you will manually review the changelog and trigger an update only if it benefits the factory and does not introduce breaking changes.
- **Auto-Extraction:** When a Project is created or updated, a background task will run `graphify extract .` in the project's `rootDir` to generate the `graphify-out/graph.json` knowledge graph.
- **Agent Queries:** Agents assigned to the project will be given the `graphify query` tool or connected to the Graphify MCP server, allowing them to ask semantic questions about the codebase (e.g., *"What connects the Auth module to the Database?"*) without brute-force grepping.

## 2. Memory Scopes
Memory in the factory is tiered to prevent context pollution.

- **Global Memory:** Factory-wide rules (e.g., "Always use Tailwind"). Handled by the `.agents/rules` directory.
- **Project Memory (The Graph):** The Graphify knowledge graph specific to a single client/project repo.
- **Task Memory (Ephemeral):** Short-term memory for a specific agent execution loop. Erased when the task is marked "done."

## 3. The Work Memory Overlay (Lessons Learned)
**Vision:** The system must learn from its mistakes. If an agent tries a solution and it fails, it should remember that failure so future agents don't repeat it.

**Technical Implementation:**
- **Reflection:** After a complex task is completed or corrected by you, we will use Graphify's `graphify reflect` command to generate a `LESSONS.md` overlay.
- **Injection:** These lessons are overlayed on top of the Project Graph, tagging specific code nodes with "preferred" or "dead end" annotations based on past agent outcomes.

## 4. Graph Access (MCP Server & Query Optimization)
**Vision:** Agents need lightning-fast access to the graph, but they must not fall into the "dumb search loop" (making generic queries and paging through hundreds of irrelevant results).

**Technical Implementation:**
- **Ephemeral MCP Servers:** We will use Graphify's MCP server (`graphify.serve`). However, to save RAM, Sparstrowgen will only boot this server when an agent *starts* a task, and kill it when the task *ends*.
- **Strict Query Heuristics (Solving the Dumb Search Loop):** The biggest issue with MCP tools is agents making lazy, broad queries (e.g., `list_all_tasks()`) and then spending 10 minutes paging through them. To fix this, Sparstrowgen will natively inject **"Query Heuristics"** into the agent's system prompt:
  - *Rule 1:* NEVER use generic list queries if you are looking for a specific entity. 
  - *Rule 2:* Always use Graphify's semantic `query_graph(question="...")` tool or `shortest_path(source="A", target="B")` tool to let the backend database do the filtering for you in milliseconds.
  - *Rule 3:* If you receive more than 20 results, immediately refine your tool call with stricter filters instead of manually paging through the data.

## 5. Memory Consolidation (The GBrain Method)
**Vision:** Memory pollution and duplicate context are the biggest enemies of AI agents. If an agent writes 10 different notes about "Database Setup," the context window will be flooded with overlapping, redundant text. We will implement methods from [GBrain](https://github.com/garrytan/gbrain) to solve this.

**Technical Implementation:**
- **The Dream Cycle (Background Dedup & Strict Isolation):** We will implement a nightly Cron job (The Dream Cycle) that runs **independently for every active project and subproject**. This is strictly isolated: when the cron job runs for a client-specific subproject (like Clinic A), it *only* reads and deduplicates that exact project's `memoryNotes`. It will never cross-pollinate or mix context across different projects, ensuring that every client variant maintains its own purely isolated, smart brain.
- **Synthesis over Search (`gbrain think`):** When an agent queries the memory, the system will not just return raw grep results. It will use a synthesis layer to read the top hits, deduplicate the overlapping claims on the fly, and return a single, synthesized answer with explicit citations and a "gap analysis" (telling the agent what is still unknown).
- **Auto-Linking:** Memory notes will support explicit wikilink syntax (e.g., `[[API_Auth]]`). The system will automatically extract these links and turn them into hard graph edges without requiring an expensive LLM call.

## 6. Advanced GBrain Extractions (Maximizing the Brain)
**Vision:** To get the absolute most out of the GBrain methodology without importing the repo, Sparstrowgen will natively implement its most advanced autonomous memory features.

**Technical Implementation:**
- **Passive Signal Detection:** Instead of relying *only* on an agent explicitly calling a `save_memory` tool, Sparstrowgen will implement a "Signal Detector" middleware. It will passively monitor the agent's chat history/outputs and automatically capture entities, decisions, and outcomes into the memory database in the background.
- **Typed Schemas:** Instead of a generic `memoryNotes` table where everything is a "note," memory entries will be strongly typed (e.g., `Decision`, `Meeting`, `Architecture`, `Pitfall`). This allows the query engine to filter by type (e.g., "Give me all *Decisions* regarding the Auth module").
- **The Contradiction Engine:** As part of the nightly Dream Cycle, a secondary pass will run GBrain's `suspected-contradictions` logic. It will sample memory notes, find if two notes conflict (e.g., one says "Use REST", the other says "Use GraphQL"), and flag them for the human or agent to resolve the next day.
