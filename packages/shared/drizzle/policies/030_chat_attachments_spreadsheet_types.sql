-- 030_chat_attachments_spreadsheet_types.sql
--
-- LV1 (T-LV1-01) — expands the allowed MIME types on the `chat-attachments`
-- bucket to include Excel spreadsheet formats (.xlsx and .xls) alongside .csv,
-- enabling agents and users to upload and produce rich spreadsheet workbooks.

update storage.buckets
set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'text/plain', 'text/markdown', 'text/csv',
  'application/json', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]
where id = 'chat-attachments';
