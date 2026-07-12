-- 006: task-engine columns on the (previously dormant) tasks table.
-- key:    stable template identifier (e.g. 'chase_appraiser'); null for manual tasks.
-- source: 'template' (engine-spawned) | 'manual' (agent-created).
alter table tasks
  add column if not exists key text,
  add column if not exists source text not null default 'template',
  add column if not exists note text,
  add column if not exists completed_at timestamptz;

create index if not exists tasks_claim_status_due_idx
  on tasks (claim_id, status, due_at);

-- At most one OPEN template task per (claim, key). A 'done' task frees the key,
-- allowing a justified re-spawn (spec §10). Races between concurrent requests
-- resolve here as a 23505 the runner ignores.
create unique index if not exists tasks_claim_key_open_uniq
  on tasks (claim_id, key)
  where key is not null and status <> 'done';
