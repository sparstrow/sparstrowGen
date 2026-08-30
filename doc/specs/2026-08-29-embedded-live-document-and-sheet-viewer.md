# Embedded Live Document & Sheet Viewer in Chat Right Pane — Specification

**Date:** 2026-08-29
**Status:** In Review
**Phase / Band:** `LV1` (Live Viewers 1)

---

## 1. Problem Statement & Motivation

Currently, when an agent or user produces/attaches files in a chat conversation:
1. **Images** (`.png`, `.jpg`, `.webp`, `.gif`) are shown as visual thumbnails inline and in the right-side preview drawer.
2. **Documents & Spreadsheets** (`.csv`, `.pdf`, `.json`, `.txt`, `.md`) are rendered only as static attachment chips. Clicking them opens a centered modal dialog with an external download link, forcing users to leave the context of their conversation or download files locally to view them.
3. **Excel Binary Files** (`.xlsx`, `.xls`) are currently refused by the attachment pipeline allowlist.

Users need to immediately view, inspect, and analyze documents, spreadsheets, PDFs, and data files right alongside their conversation without leaving the chat page.

---

## 2. User Stories & Acceptance Criteria

### User Story 1: Interactive In-Pane Spreadsheet & CSV Inspection
* **Scenario**: An agent produces a CSV or Excel workbook (e.g. `quarterly_revenue.xlsx` or `metrics.csv`).
* **Behavior**: Clicking the file chip in the chat transcript or in the right Preview panel transforms the right sidebar into an interactive spreadsheet grid.
* **Acceptance Criteria**:
  - Displays formatted tabular data with row numbers and column headers.
  - Supports switching between worksheets in multi-sheet Excel files.
  - Provides a quick search/filter bar to filter table rows in real time.
  - Displays header metadata (filename, size, sheet name, total rows/cols).
  - Includes a Download action button to export the raw file.

### User Story 2: Embedded In-Pane PDF Viewer
* **Scenario**: A user attaches a PDF contract or an agent generates a PDF report (`summary.pdf`).
* **Behavior**: Clicking the PDF chip loads an embedded, responsive PDF reader directly inside the right pane.
* **Acceptance Criteria**:
  - Renders the PDF via an embedded object/iframe using the short-lived signed URL.
  - Supports scrolling through pages, zoom controls, and fit-to-width.
  - Fallback button provided to open in a new tab if browser inline PDF rendering is restricted.

### User Story 3: Markdown, JSON & Text Inspector
* **Scenario**: An agent outputs a structured data payload (`config.json`), code snippet, or markdown doc.
* **Behavior**: Clicking the file renders a formatted, syntax-highlighted code / markdown view in the right pane.
* **Acceptance Criteria**:
  - Syntax highlighting for JSON, Markdown, and plain text.
  - "Copy to clipboard" button to copy full raw contents.
  - Clean monospace typography with line numbers.

### User Story 4: Seamless Navigation & Multi-Screen Support
* **Scenario**: The user inspects a file and wants to switch back to the file gallery or view on smaller screens.
* **Behavior**:
  - On desktop (`xl` breakpoint), the top of the right pane displays a `← All files` back button, filename breadcrumb, and action buttons (Download, Fullscreen modal).
  - Clicking `← All files` smoothly returns to the `ConversationItems` gallery index.
  - On mobile/tablet screens (below `xl`), the existing header Sheet drawer hosts the same viewer.

---

## 3. Scope & Boundaries

### In Scope
- Extending `CHAT_PRODUCED_ALLOWED_TYPES` and `CHAT_ATTACHMENT_ALLOWED_TYPES` to support `.xlsx` and `.xls`.
- Updating the `chat-attachments` storage bucket policy to permit spreadsheet MIME types.
- Creating the `DocumentSheetViewer` component supporting Excel/CSV, PDF, Markdown/JSON, and Image modes.
- Integrating active file selection into `apps/web/src/app/chat/chat.tsx`.
- Comprehensive unit tests and automated Playwright browser verification.

### Out of Scope
- In-browser file editing/mutation (the viewer is strictly read-only; agents generate edits via chat turns).
- Proprietary legacy binary document formats (`.doc`, `.ppt`).
