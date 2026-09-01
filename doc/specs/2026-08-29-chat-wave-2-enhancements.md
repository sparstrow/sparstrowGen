# Chat Wave 2 Enhancements (CH2)
## Specification

**Date**: 2026-08-29
**Phase**: CH2

### 1. Multi-File Attachment Queue
Currently, the chat composer only allows a single file upload per turn.
* **Requirement**: The composer must accept multiple files simultaneously via drag-and-drop or file selector.
* **UX**: A horizontal flex row of pending attachment chips above the textarea, each with a loading state and a remove (`×`) button.
* **Send Gate**: The message send action must block until all files are uploaded and bound.

### 2. In-Pane Chart View for Spreadsheets
* **Requirement**: Extend the `DocumentSheetViewer` to support visual charting of tabular data (.csv, .xlsx).
* **UX**: Add a toggle group (Table | Chart) in the header. When Chart is selected, infer the first text/date column as the X-axis and plot subsequent numeric columns as lines or bars using Recharts.

### 3. Project Chat "What Changed" Diff Inspector (Idea I-11)
* **Requirement**: Give users immediate visibility into what an agent modified in their codebase during a `project` chat.
* **Implementation Strategy**: Instead of deep frontend/backend API coupling, the core daemon will run `git diff HEAD` at the end of a project chat turn. If changes exist, it writes the diff to `turn_changes.diff` in the outbox. The existing sweep logic attaches it. The frontend `DocumentSheetViewer` will simply recognize `.diff` files and render them with syntax highlighting.

### 4. Full-Text Search Across Conversations (Idea I-2)
* **Requirement**: Users must be able to search past conversations.
* **UX**: A search bar in the chat sidebar. Matching results show the session title and snippet of the match. Clicking jumps to the session.
* **Data Layer**: TRPC `chat.search` procedure executing a Postgres `ILIKE` search across `chat_messages` text and `chat_message_attachments` filenames.
