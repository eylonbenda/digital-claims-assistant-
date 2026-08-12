-- 008: outbound_events — append-only log of outbound-queue decisions (phase-2 C1).
-- One row per send/skip. The queue itself is DERIVED on read from tasks +
-- checklist state; only what happened is persisted, so nothing here can go stale.
-- NOTE: kind='sent' means "the agent tapped the wa.me link", NOT "delivered" —
-- wa.me reports nothing back. Adequate for cooldowns; must become a real
-- delivery record (BSP receipts) before any rule flips to auto.
create table if not exists outbound_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  task_key text not null,
  recipient_kind text not null default 'client',
  channel text not null default 'whatsapp',
  kind text not null check (kind in ('sent', 'skipped')),
  body_snapshot text,                          -- what actually went out (kind='sent' only)
  actor text not null default 'agent' check (actor in ('agent', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists outbound_events_cooldown_idx
  on outbound_events (claim_id, task_key, created_at desc);

alter table outbound_events enable row level security;

-- Agent reads own rows via the auth client; writes go through the service
-- client only (no insert/update policy on purpose). Postgres has no
-- `create policy if not exists` — drop first so this stays safe to re-run
-- over a schema.sql that already contains it.
drop policy if exists "child: outbound_events" on outbound_events;
create policy "child: outbound_events" on outbound_events for select
  using (claim_belongs_to_me(claim_id));

grant select on outbound_events to authenticated;
grant all on outbound_events to service_role;
