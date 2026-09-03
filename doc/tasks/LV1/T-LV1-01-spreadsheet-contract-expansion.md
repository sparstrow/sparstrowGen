# T-LV1-01 — Spreadsheet Contract & MIME Allowlist Expansion

**Status:** 🟢 Completed
**Band:** `LV1`

## Objectives
1. Update `packages/shared/src/constants.ts`:
   - Add `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` -> `xlsx`.
   - Add `application/vnd.ms-excel` -> `xls`.
2. Add migration `packages/shared/drizzle/policies/030_chat_attachments_spreadsheet_types.sql` updating `storage.buckets.allowed_mime_types` for `chat-attachments`.
3. Update and pass shared contract unit tests in `packages/shared/src/chat-produced.test.ts`.
