-- 007: agent_briefs — one cached morning brief per agent per UTC day.
create table if not exists agent_briefs (
  agent_id   uuid not null references agents(id) on delete cascade,
  brief_date date not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (agent_id, brief_date)
);

alter table agent_briefs enable row level security;

-- Agents read their own briefs via the anon/auth client; writes go through the
-- service client only (no insert/update policy on purpose).
-- Postgres has no `create policy if not exists`, so drop first — this migration is
-- applied by hand and must stay safe to re-run over a schema.sql that already has it.
drop policy if exists "agent reads own briefs" on agent_briefs;
create policy "agent reads own briefs" on agent_briefs for select
  using (agent_id in (select id from agents where auth_user_id = auth.uid()));

grant select on agent_briefs to authenticated;
grant all on agent_briefs to service_role;
