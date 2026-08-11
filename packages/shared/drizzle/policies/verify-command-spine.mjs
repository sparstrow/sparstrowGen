/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4 verification: prove the command spine's SQL actually behaves.
 *
 * Runs against a disposable container — never against your Supabase project,
 * for the same reason verify-rls.sh says so. Requires Docker.
 *
 *   node packages/shared/drizzle/policies/verify-command-spine.mjs
 *
 * Exits non-zero on the first failed assertion.
 *
 * Node rather than bash, unlike its sibling: the claim assertions need two
 * sessions interleaved (one holding an uncommitted transaction while the other
 * claims), and orchestrating that through `docker exec psql` is far harder to
 * read than two awaited connections.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import postgres from "postgres";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTAINER = "sparstrow-cmd-check";
const PORT = 55433;
const URL = `postgres://postgres:verify@127.0.0.1:${PORT}/sparstrow_verify`;

const docker = (...args) => execFileSync("docker", args, { stdio: "pipe" }).toString();
const quietly = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

let failures = 0;
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

/** Run `fn` and return the SQLSTATE it raised, or null if it succeeded. */
async function errcodeOf(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err.code ?? "NO_CODE";
  }
}

/**
 * Impersonate a signed-in user. This is what makes membership checks real: the
 * policies and start_run both resolve the caller through auth.uid(), which the
 * stub below reads out of the request.jwt.claims GUC exactly as Supabase does.
 */
const asUser = (sql, userId, fn) =>
  sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx.unsafe(`set local request.jwt.claims = '{"sub":"${userId}"}'`);
    return fn(tx);
  });

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

async function main() {
  console.log("→ starting throwaway postgres…");
  quietly(() => docker("rm", "-f", CONTAINER));
  docker(
    "run", "-d", "--name", CONTAINER,
    "-e", "POSTGRES_PASSWORD=verify",
    "-e", "POSTGRES_DB=sparstrow_verify",
    "-p", `${PORT}:5432`,
    "postgres:17-alpine",
  );

  let sql;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      sql = postgres(URL, { max: 1, connect_timeout: 5, fetch_types: false, onnotice: () => {} });
      await sql`select 1`;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
      sql = null;
    }
  }
  if (!sql) throw new Error("postgres never became ready");

  // ── Supabase surface these files depend on ──────────────────────────────
  // Same stub as verify-rls.sh. auth.uid() reads the JWT claim from a GUC, so
  // `set local request.jwt.claims` impersonates a user.
  console.log("→ stubbing supabase surface…");
  await sql.unsafe(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
    $$;
    create publication supabase_realtime;
  `);

  console.log("→ applying migration + policies…");
  const migration = fs.readdirSync(path.join(HERE, "..")).find((f) => /^0000_.*\.sql$/.test(f));
  await sql.unsafe(fs.readFileSync(path.join(HERE, "..", migration), "utf8"));
  // The same broad grant Supabase hands out by default, so what restricts
  // access is proven to be the policies rather than a missing grant.
  await sql.unsafe(`grant all on all tables in schema public to anon, authenticated;`);
  await sql.unsafe(fs.readFileSync(path.join(HERE, "001_rls.sql"), "utf8"));
  await sql.unsafe(fs.readFileSync(path.join(HERE, "009_command_spine.sql"), "utf8"));

  console.log("→ seeding two isolated workspaces…");
  await sql.unsafe(`
    insert into workspaces (id, name, slug, owner_id) values
      ('ws-a', 'Alpha', 'alpha', '${USER_A}'),
      ('ws-b', 'Beta',  'beta',  '${USER_B}');
    insert into users (id, email, name) values
      ('${USER_A}', 'a@example.com', 'A'),
      ('${USER_B}', 'b@example.com', 'B');
    insert into workspace_members (id, workspace_id, user_id, role) values
      ('m-a', 'ws-a', '${USER_A}', 'owner'),
      ('m-b', 'ws-b', '${USER_B}', 'owner');

    insert into agents (id, workspace_id, name, slug, provider, model) values
      ('ag-a',   'ws-a', 'Builder',  'builder',  'claude-code', 'sonnet'),
      ('ag-off', 'ws-a', 'Disabled', 'disabled', 'claude-code', 'sonnet'),
      ('ag-exotic','ws-a','Exotic',  'exotic',   'no-such-provider', 'x');
    update agents set enabled = false where id = 'ag-off';

    insert into projects (id, workspace_id, name, slug) values
      ('pj-a',    'ws-a', 'App',     'app'),
      ('pj-lost', 'ws-a', 'Nowhere', 'nowhere');

    -- rt-live is online and capable; rt-stale beat two hours ago.
    insert into runtimes (id, workspace_id, name, os, hostname, capabilities, last_heartbeat) values
      ('rt-live',  'ws-a', 'live',  'win32', 'live',  '["claude-code","ollama"]'::jsonb, now()),
      ('rt-stale', 'ws-a', 'stale', 'linux', 'stale', '["claude-code"]'::jsonb, now() - interval '2 hours');

    insert into runtime_projects (workspace_id, runtime_id, project_id, local_path, state) values
      ('ws-a', 'rt-live', 'pj-a', 'D:\\\\code\\\\app', 'bound');

    insert into tasks (id, workspace_id, title, status) values
      ('tk-a', 'ws-a', 'do the thing', 'todo');
  `);

  // ── start_run ───────────────────────────────────────────────────────────
  console.log("\nstart_run");

  const started = await asUser(sql, USER_A, (tx) =>
    tx`select public.start_run('ag-a', 'build it', 'pj-a', 'tk-a') as run`,
  );
  const run = started[0].run;
  check("creates a run targeting the online, capable, bound runtime", run.target_runtime_id === "rt-live", run.target_runtime_id);
  check("run starts queued", run.status === "queued");

  const [command] = await sql`select * from runtime_commands where kind = 'run.start'`;
  check("enqueues exactly one run.start command", !!command);
  check("command targets the same runtime", command?.runtime_id === "rt-live");
  check("idempotency key embeds the run id", command?.idempotency_key === `run.start:${run.id}`);
  check("payload carries the agent slug for daemon-side resolution", command?.payload?.agentSlug === "builder", JSON.stringify(command?.payload));
  check("payload carries the project slug", command?.payload?.projectSlug === "app");
  check("payload carries the run id", command?.payload?.runId === run.id);

  const [task] = await sql`select * from tasks where id = 'tk-a'`;
  check("linked task moves to in_progress with the run id", task.status === "in_progress" && task.run_id === run.id);

  check(
    "a member of B cannot start a run on A's agent",
    (await errcodeOf(() => asUser(sql, USER_B, (tx) => tx`select public.start_run('ag-a', 'sneaky')`))) === "SPG10",
  );
  check(
    "a disabled agent is refused at enqueue, before anything spawns",
    (await errcodeOf(() => asUser(sql, USER_A, (tx) => tx`select public.start_run('ag-off', 'x')`))) === "SPG11",
  );
  check(
    "no machine carrying the agent's provider is SPG12",
    (await errcodeOf(() => asUser(sql, USER_A, (tx) => tx`select public.start_run('ag-exotic', 'x')`))) === "SPG12",
  );
  check(
    "a project no online machine has bound is SPG13, distinct from SPG12",
    (await errcodeOf(() => asUser(sql, USER_A, (tx) => tx`select public.start_run('ag-a', 'x', 'pj-lost')`))) === "SPG13",
  );
  check(
    "an explicit but offline target is refused, never silently substituted",
    (await errcodeOf(() =>
      asUser(sql, USER_A, (tx) => tx`select public.start_run('ag-a', 'x', null, null, 'rt-stale')`),
    )) === "SPG12",
  );

  const beforeStale = await sql`select count(*)::int as n from runs where target_runtime_id = 'rt-stale'`;
  check("nothing was queued against the offline machine", beforeStale[0].n === 0);

  // ── claim ───────────────────────────────────────────────────────────────
  console.log("\nclaim_runtime_commands");

  // Three more commands so there is something to divide between two claimers.
  await sql.unsafe(`
    insert into runtime_commands (id, workspace_id, runtime_id, kind, payload, idempotency_key) values
      ('cmd-1', 'ws-a', 'rt-live', 'run.start', '{}'::jsonb, 'k1'),
      ('cmd-2', 'ws-a', 'rt-live', 'run.start', '{}'::jsonb, 'k2'),
      ('cmd-3', 'ws-a', 'rt-live', 'run.start', '{}'::jsonb, 'k3');
  `);

  // The real SKIP LOCKED property: session one holds an uncommitted claim while
  // session two claims. Session two must get DIFFERENT rows, and must not block.
  const other = postgres(URL, { max: 1, fetch_types: false, onnotice: () => {} });
  let firstIds = [];
  let secondIds = [];
  await sql.begin(async (tx) => {
    const first = await tx`select id from public.claim_runtime_commands('rt-live', 2, 60000)`;
    firstIds = first.map((r) => r.id);
    const second = await Promise.race([
      other`select id from public.claim_runtime_commands('rt-live', 2, 60000)`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("blocked")), 5000)),
    ]);
    secondIds = second.map((r) => r.id);
  });

  check("first claimer takes rows", firstIds.length === 2, JSON.stringify(firstIds));
  check("concurrent claimer is not blocked by the uncommitted claim", secondIds.length > 0);
  check(
    "the two claims are disjoint — no command is dispatched twice",
    firstIds.every((id) => !secondIds.includes(id)),
    `${JSON.stringify(firstIds)} vs ${JSON.stringify(secondIds)}`,
  );

  const [claimedCount] = await sql`select count(*)::int as n from runtime_commands where status = 'claimed'`;
  check("every claimed row is accounted for once", claimedCount.n === 4);

  // Lease expiry is the entire crash-recovery story: a daemon killed between
  // claim and ack must have its work picked up, and exactly once.
  await sql`update runtime_commands set lease_expires_at = now() - interval '1 minute' where id = 'cmd-1'`;
  const reclaimed = await sql`select id, attempts from public.claim_runtime_commands('rt-live', 10, 60000)`;
  check("an expired lease is reclaimed", reclaimed.some((r) => r.id === "cmd-1"), JSON.stringify(reclaimed));
  check("reclaiming increments attempts", reclaimed.find((r) => r.id === "cmd-1")?.attempts === 2);

  // Poison-message ceiling.
  await sql`update runtime_commands set attempts = 5, lease_expires_at = now() - interval '1 minute' where id = 'cmd-2'`;
  const afterCeiling = await sql`select id from public.claim_runtime_commands('rt-live', 10, 60000)`;
  check("a command abandoned 5 times is never dispatched again", !afterCeiling.some((r) => r.id === "cmd-2"));
  const [poisoned] = await sql`select status, error from runtime_commands where id = 'cmd-2'`;
  check("…and is retired to expired rather than left claimed forever", poisoned.status === "expired", poisoned.status);
  check("…with a reason on the row", !!poisoned.error);

  const otherRuntime = await sql`select id from public.claim_runtime_commands('rt-stale', 10, 60000)`;
  check("claiming for a different runtime returns none of this one's work", otherRuntime.length === 0);

  // ── ack ─────────────────────────────────────────────────────────────────
  console.log("\nack_runtime_command");

  const [ack1] = await sql`select public.ack_runtime_command('cmd-3', 'rt-live', 'done') as r`;
  check("ack closes the command", ack1.r.ok === true && ack1.r.alreadyCompleted === false);
  const [ack2] = await sql`select public.ack_runtime_command('cmd-3', 'rt-live', 'done') as r`;
  check("a retried ack reports success, not an error", ack2.r.ok === true && ack2.r.alreadyCompleted === true);
  const [ackWrong] = await sql`select public.ack_runtime_command('cmd-1', 'rt-stale', 'done') as r`;
  check("a runtime cannot ack another machine's command", ackWrong.r.ok === false);
  check(
    "ack rejects a status outside done/failed",
    (await errcodeOf(() => sql`select public.ack_runtime_command('cmd-1', 'rt-live', 'succeeded')`)) === "SPG10",
  );

  // ── cancel ──────────────────────────────────────────────────────────────
  console.log("\ncancel_run");

  const cancelled = await asUser(sql, USER_A, (tx) => tx`select public.cancel_run(${run.id}) as run`);
  check("cancel enqueues a run.cancel for the target runtime", cancelled[0].run.id === run.id);
  const [cancelCmd] = await sql`select * from runtime_commands where kind = 'run.cancel'`;
  check("…exactly one, keyed on the run id", cancelCmd?.idempotency_key === `run.cancel:${run.id}`);

  await asUser(sql, USER_A, (tx) => tx`select public.cancel_run(${run.id})`);
  const [cancelCount] = await sql`select count(*)::int as n from runtime_commands where kind = 'run.cancel'`;
  check("cancelling twice does not enqueue twice", cancelCount.n === 1);

  await sql`update runs set status = 'succeeded' where id = ${run.id}`;
  await sql`delete from runtime_commands where kind = 'run.cancel'`;
  await asUser(sql, USER_A, (tx) => tx`select public.cancel_run(${run.id})`);
  const [afterTerminal] = await sql`select count(*)::int as n from runtime_commands where kind = 'run.cancel'`;
  check("cancelling a finished run is a no-op, not an error", afterTerminal.n === 0);

  check(
    "a member of B cannot cancel A's run",
    (await errcodeOf(() => asUser(sql, USER_B, (tx) => tx`select public.cancel_run(${run.id})`))) === "SPG15",
  );

  // ── grants ──────────────────────────────────────────────────────────────
  console.log("\ngrants");

  check(
    "authenticated cannot claim — it would let any user drain a machine's queue",
    (await errcodeOf(() =>
      asUser(sql, USER_A, (tx) => tx`select public.claim_runtime_commands('rt-live', 1, 1000)`),
    )) === "42501",
  );
  check(
    "authenticated cannot ack",
    (await errcodeOf(() =>
      asUser(sql, USER_A, (tx) => tx`select public.ack_runtime_command('cmd-1', 'rt-live', 'done')`),
    )) === "42501",
  );

  await other.end();
  await sql.end();
}

main()
  .then(() => {
    quietly(() => docker("rm", "-f", CONTAINER));
    if (failures > 0) {
      console.log(`\n${failures} assertion(s) failed.`);
      process.exit(1);
    }
    console.log("\nAll command-spine assertions passed.");
  })
  .catch((err) => {
    quietly(() => docker("rm", "-f", CONTAINER));
    console.error("\nverification errored:", err);
    process.exit(1);
  });
