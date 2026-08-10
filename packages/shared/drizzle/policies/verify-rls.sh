#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# M1 verification: apply the schema + policies to a throwaway Postgres and
# prove workspace isolation actually holds.
#
# Runs against a disposable container — never against your Supabase project.
# Requires Docker to be running. Nothing else (psql runs inside the container).
#
#   bash packages/shared/drizzle/policies/verify-rls.sh
#
# Exits non-zero on the first failed assertion.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

CONTAINER=sparstrow-rls-check
PGPASSWORD=verify
DB=sparstrow_verify
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$(ls "$HERE"/../0000_*.sql | head -1)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ starting throwaway postgres…"
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PGPASSWORD" -e POSTGRES_DB="$DB" \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1; then break; fi
  sleep 1
done

psql() { docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }

# ── Supabase surface these files depend on ────────────────────────────────
# The policies call auth.uid() and 002 touches the supabase_realtime
# publication. Stub both so a vanilla Postgres can exercise the real SQL.
# auth.uid() is modelled on Supabase's own implementation (reads the JWT claim
# from a GUC) so tests can impersonate a user with `set request.jwt.claims`.
echo "→ stubbing supabase surface…"
psql <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;
create publication supabase_realtime;
SQL

echo "→ applying migration…"
psql < "$MIGRATION" >/dev/null
# Grant the same broad access Supabase hands out by default, so the policy
# files are proven to be what actually restricts access — not a missing grant.
psql -c 'grant all on all tables in schema public to anon, authenticated;' >/dev/null

echo "→ applying policies…"
psql < "$HERE/001_rls.sql" >/dev/null
psql < "$HERE/002_realtime.sql" >/dev/null

echo "→ seeding two isolated workspaces…"
psql <<'SQL' >/dev/null
insert into workspaces (id, name, slug, owner_id) values
  ('ws-a', 'Alpha', 'alpha', '00000000-0000-0000-0000-00000000000a'),
  ('ws-b', 'Beta',  'beta',  '00000000-0000-0000-0000-00000000000b');
insert into users (id, email, name) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', 'A'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', 'B');
insert into workspace_members (id, workspace_id, user_id, role) values
  ('m-a', 'ws-a', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('m-b', 'ws-b', '00000000-0000-0000-0000-00000000000b', 'owner');
insert into tasks (id, workspace_id, title) values
  ('t-a', 'ws-a', 'alpha task'),
  ('t-b', 'ws-b', 'beta task');
insert into runtimes (id, workspace_id, name, os, hostname) values
  ('rt-b', 'ws-b', 'beta-box', 'linux', 'beta');
insert into daemon_tokens (id, workspace_id, runtime_id, token_hash) values
  ('dt-b', 'ws-b', 'rt-b', 'super-secret-hash');
SQL

fail=0
check() { # check <label> <sql> <expected>
  local got
  got=$(psql -tA -c "$2" 2>&1 | tr -d '[:space:]') || got="ERROR"
  if [ "$got" = "$3" ]; then
    echo "  ✓ $1"
  else
    echo "  ✗ $1 — expected '$3', got '$got'"
    fail=1
  fi
}

# `set role authenticated` matters: a superuser bypasses RLS entirely, so
# asserting as postgres would pass no matter how broken the policies are.
as_a="set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-00000000000a\"}';"

echo "→ asserting isolation as user A (member of ws-a only)…"
check "sees own workspace's task"        "$as_a select count(*) from tasks where workspace_id='ws-a';" "1"
check "CANNOT see other workspace's task" "$as_a select count(*) from tasks where workspace_id='ws-b';" "0"
check "CANNOT see any ws-b runtime"       "$as_a select count(*) from runtimes where workspace_id='ws-b';" "0"
check "sees own workspace row"            "$as_a select count(*) from workspaces where id='ws-a';" "1"
check "CANNOT see other workspace row"    "$as_a select count(*) from workspaces where id='ws-b';" "0"
check "CANNOT see unrelated user"         "$as_a select count(*) from users where id='00000000-0000-0000-0000-00000000000b';" "0"

echo "→ asserting writes are blocked across the boundary…"
check "CANNOT insert into other workspace" \
  "$as_a insert into tasks (id, workspace_id, title) values ('t-x','ws-b','injected'); select 1;" "ERROR"
check "CANNOT update other workspace's task" \
  "$as_a update tasks set title='hijacked' where workspace_id='ws-b'; select count(*) from tasks where title='hijacked';" "0"

echo "→ asserting credential columns are not readable…"
check "CANNOT read daemon token hash" "$as_a select token_hash from daemon_tokens;" "ERROR"

echo "→ asserting anon has nothing…"
check "anon sees no tasks" "set role anon; select count(*) from tasks;" "0"

echo
if [ "$fail" -eq 0 ]; then
  echo "✅ RLS verification passed — workspace isolation holds."
else
  echo "❌ RLS verification FAILED"
fi
exit "$fail"
