# Chat Wave 2 Enhancements (CH2)
## Architecture Plan

### F1: Multi-File Attachment Queue
1. **State Management**: Refactor `apps/web/src/app/chat/chat.tsx`. Change `pendingAttachment: ChatAttachmentUpload | null` to `pendingAttachments: ChatAttachmentUpload[]`.
2. **UI Updates**: In `chat-input.tsx` (or equivalent composer component), iterate over the array to render multiple `PendingAttachmentChip` elements.
3. **Upload Concurrency**: Adapt the drag-and-drop and file selection handlers to process arrays of `File` objects, initiating Supabase `storage.from('chat-attachments').upload` concurrently.

### F2: Spreadsheet Chart View
1. **Dependency**: `pnpm --filter web add recharts lucide-react`.
2. **Component Enhancement**: In `apps/web/src/components/chat/document-sheet-viewer.tsx`:
   - Add state: `viewMode: 'table' | 'chart'`.
   - Data Parsing: Extract headers. Identify X-axis (first column) and Y-axis keys (numeric columns).
   - Render `recharts` `<ResponsiveContainer>` with a `<LineChart>` or `<BarChart>`.

### F3: Diff Inspector (.diff attachments)
1. **Backend**: In `packages/core/src/cloud/chat-turn.ts`:
   - Inside `executeChatTurn`, after `completeOnce`, check `if (payload.sessionKind === 'project')`.
   - Run `git diff HEAD` via `execSync`.
   - If output > 0, `fs.writeFileSync(path.join(outboxDir, 'changes.diff'), diffOutput)`.
2. **Frontend**: Update `packages/shared/src/constants.ts` allowed mime types to accept `text/x-diff` or `.diff`.
3. **Viewer**: In `DocumentSheetViewer`, map `.diff` to `TextCodeView` with language `diff` to enable syntax highlighting.

### F4: Full-Text Search
1. **API Route**: In `packages/api/src/routers/chat.ts`, add `searchChats: protectedProcedure.input(z.object({ query: z.string() })).query(...)`.
2. **Query**: `db.select().from(chatMessages).leftJoin(chatSessions).where(ilike(chatMessages.text, `%${query}%`))`.
3. **UI**: Add `SearchInput` in the sidebar. On type (debounced), fetch TRPC results and render a list of matches over the normal session list.
