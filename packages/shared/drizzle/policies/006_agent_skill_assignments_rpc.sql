-- 006_agent_skill_assignments_rpc.sql
--
-- PUT /skills/assignments is a set operation: replace every assignment in the
-- workspace with the posted list. The handler did that as two PostgREST calls
-- -- delete-all, then insert -- which cannot be a transaction, because
-- PostgREST cannot span statements. If the insert then failed (a bad agent_id
-- or skill_id is enough), the delete had already committed and EVERY skill
-- assignment in the workspace was gone, with the client seeing only an error.
--
-- Same root cause as the bootstrap problem in 004: a multi-statement invariant
-- expressed as multiple round trips. Same fix: move it into the database.
--
-- SECURITY INVOKER, not DEFINER -- the function runs as the caller so RLS
-- applies to both the delete and the insert exactly as it would inline. A
-- caller passing someone else's workspace id deletes nothing and fails the
-- insert's WITH CHECK, so no extra ownership check is needed here. (004 needs
-- DEFINER because it must write the very membership row that RLS keys on;
-- this one does not.)

create or replace function public.set_agent_skill_assignments(
  p_workspace_id text,
  p_assignments  jsonb
)
returns setof public.agent_skills
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.agent_skills where workspace_id = p_workspace_id;

  return query
  insert into public.agent_skills (workspace_id, agent_id, skill_id)
  select p_workspace_id, a ->> 'agent_id', a ->> 'skill_id'
  from pg_catalog.jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) a
  where a ->> 'agent_id' is not null
    and a ->> 'skill_id' is not null
  returning *;
end;
$$;

revoke all on function public.set_agent_skill_assignments(text, jsonb) from public, anon;
grant execute on function public.set_agent_skill_assignments(text, jsonb) to authenticated;
