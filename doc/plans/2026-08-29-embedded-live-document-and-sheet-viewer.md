# Embedded Live Document & Sheet Viewer in Chat Right Pane — Plan

| | |
|---|---|
| **Spec** | [`doc/specs/2026-08-29-embedded-live-document-and-sheet-viewer.md`](../specs/2026-08-29-embedded-live-document-and-sheet-viewer.md) |
| **Status** | 🟡 Proposed / Ready for Execution |
| **Depends on** | CS5, AM1–AM4 (Band 27 chat produced attachments foundations) |
| **Touches** | `packages/shared/src/constants.ts`, `packages/shared/drizzle/`, `apps/web/src/components/chat/`, `apps/web/src/app/chat/chat.tsx` |
| **Tasks** | `LV1` (`T-LV1-01`, `T-LV1-02`, `T-LV1-03`, `T-LV1-04`) |

---

## 1. Architectural Strategy

### A. Format Expansion (Excel + Spreadsheets)
Extend `CHAT_ATTACHMENT_ALLOWED_TYPES` and `CHAT_PRODUCED_ALLOWED_TYPES` in `packages/shared/src/constants.ts` to include:
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`: `"xlsx"`
- `application/vnd.ms-excel`: `"xls"`

Add database migration policy (`030_chat_attachments_spreadsheet_types.sql`) updating the `chat-attachments` bucket's `allowed_mime_types` array.

### B. In-Pane Multi-Format Document Inspector Component (`DocumentSheetViewer`)
Create a modular, high-performance viewer component in `apps/web/src/components/chat/document-sheet-viewer.tsx`:
1. **Spreadsheet & CSV Mode** (`.xlsx`, `.xls`, `.csv`):
   - Parse tabular data using client-side spreadsheet engine / parser.
   - Render using Shadcn UI `Table` with row indexing, sortable columns, and a real-time text filter.
   - For multi-sheet workbooks, render a sleek Shadcn `Tabs` sheet selector.
2. **PDF Mode** (`.pdf`):
   - Render high-fidelity responsive embedded reader via `<iframe src="${signedUrl}#view=FitH" />` with fallback to open in new tab.
3. **Markdown / Text / Code Mode** (`.md`, `.json`, `.txt`):
   - Syntax-highlighted code viewport with line numbers and a copy-to-clipboard button.
4. **Image Mode** (`.png`, `.jpg`, `.webp`, `.gif`, `.svg`):
   - Crisp, auto-scaling image viewer with zoom/fit toggle.

### C. Right-Pane State & Transition Management
In `apps/web/src/app/chat/chat.tsx`:
- Manage active preview state: `selectedPreviewAttachment: ChatMessageAttachment | null`.
- When `selectedPreviewAttachment === null`: Render default `ConversationItems` gallery list.
- When `selectedPreviewAttachment !== null`: Render `DocumentSheetViewer` in the right sidebar with:
  - Header: `← All files` back button, file icon, filename, size pill, download button, and maximize dialog trigger.
- Clicking any produced item in the chat message stream automatically opens the right sidebar and selects the file for instant preview.

---

## 2. Work Breakdown

| Task | Title | Description |
|---|---|---|
| `T-LV1-01` | Spreadsheet Contract & MIME Allowlist Expansion | Add `.xlsx`/`.xls` to shared constants, update bucket storage policy, and verify contract tests. |
| `T-LV1-02` | Multi-Format In-Pane Document Viewer Component | Build `DocumentSheetViewer` with interactive spreadsheet grid, sheet tabs, search filter, PDF embed, and text inspector. |
| `T-LV1-03` | Chat Right-Pane & Transcript Navigation Integration | Connect active preview state in `chat.tsx`, hook item clicks to open right-pane inspector, and support back navigation & mobile sheet. |
| `T-LV1-04` | Verification & Automated E2E Browser Testing | Unit tests across shared & web, plus Playwright automated live tests verifying spreadsheet, PDF, and image inspection. |
