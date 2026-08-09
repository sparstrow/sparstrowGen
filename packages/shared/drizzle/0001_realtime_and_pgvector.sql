-- 1. Enable Supabase Realtime Publication for live cloud sync
ALTER PUBLICATION supabase_realtime ADD TABLE runs, tasks, goals, messages, system_health;

-- 2. Create HNSW Cosine Index for pgvector RAG memory search
CREATE INDEX IF NOT EXISTS idx_memory_notes_embedding_hnsw 
ON memory_notes USING hnsw (embedding vector_cosine_ops);

-- 3. Create SECURITY INVOKER similarity search RPC function
CREATE OR REPLACE FUNCTION match_memory_notes(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_workspace_id text
)
RETURNS TABLE (
  id text,
  workspace_id text,
  project_id text,
  title text,
  path text,
  type text,
  content text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    memory_notes.id,
    memory_notes.workspace_id,
    memory_notes.project_id,
    memory_notes.title,
    memory_notes.path,
    memory_notes.type,
    memory_notes.content,
    1 - (memory_notes.embedding <=> query_embedding) AS similarity
  FROM memory_notes
  WHERE memory_notes.workspace_id = p_workspace_id
    AND 1 - (memory_notes.embedding <=> query_embedding) > match_threshold
  ORDER BY memory_notes.embedding <=> query_embedding
  LIMIT match_count;
$$;
