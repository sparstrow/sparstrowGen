# T-LV1-03 — Chat Right-Pane & Transcript Navigation Integration

**Status:** 🟢 Completed
**Band:** `LV1`

## Objectives
1. In `apps/web/src/app/chat/chat.tsx`:
   - Add state `selectedPreviewAttachment: ChatMessageAttachment | null`.
   - Wire clicking on any produced/sent file chip in the chat transcript to set `selectedPreviewAttachment` and open the right preview panel.
   - Render `DocumentSheetViewer` in the right aside when `selectedPreviewAttachment` is active.
   - Provide a `← All files` back button in the header to return to the full `ConversationItems` gallery.
   - Ensure below-`xl` Sheet drawer uses the same interactive viewer.
