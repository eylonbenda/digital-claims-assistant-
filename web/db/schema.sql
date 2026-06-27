-- Digital Claims Assistant — initial Postgres schema (Supabase).
-- Run in the Supabase SQL editor. Mirrors docs/architecture.md.
-- Agents see only their own claims (RLS). Client access is via a signed access_token,
-- handled server-side with the service role (bypasses RLS), not via anon RLS.

-- ---------- enums ----------
create type claim_type as enum ('own_policy', 'third_party_report', 'third_party_settlement', 'unknown');
create type claim_status as enum ('created', 'in_progress', 'submitted', 'classified', 'form_generated', 'checklist_active', 'closed', 'abandoned');
create type fault_party as enum ('me', 'third_party', 'unknown');
create type doc_type as enum (
  'car_photo', 'drivers_license', 'vehicle_reg', 'third_party_doc', 'police_report',
  'garage_invoice', 'appraiser_report', 'no_claim_confirmation', 'insurance_history', 'demand_form', 'other'
);
create type task_track as enum ('own_policy', 'third_party_report', 'third_party_settlement');
create type task_status as enum ('todo', 'in_progress', 'blocked', 'done');

-- ---------- tables ----------
create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete set null,
  auth_user_id uuid not null unique,            -- = auth.users.id
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  client_name text,
  client_phone text,
  claim_type claim_type not null default 'unknown',
  status claim_status not null default 'created',
  urgent boolean not null default false,
  fault fault_party,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  policy_insurer text,
  at_fault_insurer text,
  summary_json jsonb,                            -- Claude structured summary + missing-info
  checklist_state jsonb not null default '{}'::jsonb,  -- manual milestone ticks
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz
);
create index claims_agent_id_idx on claims (agent_id);
create index claims_status_idx on claims (status);

create table third_parties (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  name text, phone text, id_number text, plate text, insurer text
);

create table claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  type doc_type not null,
  storage_path text not null,
  mime text,
  uploaded_at timestamptz not null default now()
);

create table generated_forms (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  kind text not null,                            -- e.g. 'accident_notice'
  insurer text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  title text not null,
  track task_track,
  status task_status not null default 'todo',
  due_at timestamptz,
  assignee text,
  created_at timestamptz not null default now()
);

create table claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  type text not null,                            -- consent_given, step_completed, classified, ...
  payload_json jsonb,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table agents enable row level security;
alter table claims enable row level security;
alter table third_parties enable row level security;
alter table claim_documents enable row level security;
alter table generated_forms enable row level security;
alter table tasks enable row level security;
alter table claim_events enable row level security;

create policy "agent reads own row" on agents
  for select using (auth_user_id = auth.uid());

create policy "agent owns claim" on claims
  for all
  using (agent_id in (select id from agents where auth_user_id = auth.uid()))
  with check (agent_id in (select id from agents where auth_user_id = auth.uid()));

-- child tables: visible/editable when the parent claim belongs to the agent.
create or replace function claim_belongs_to_me(cid uuid) returns boolean
language sql security invoker stable as $$
  select exists (
    select 1 from claims c
    join agents a on a.id = c.agent_id
    where c.id = cid and a.auth_user_id = auth.uid()
  );
$$;

create policy "child: third_parties" on third_parties for all
  using (claim_belongs_to_me(claim_id)) with check (claim_belongs_to_me(claim_id));
create policy "child: claim_documents" on claim_documents for all
  using (claim_belongs_to_me(claim_id)) with check (claim_belongs_to_me(claim_id));
create policy "child: generated_forms" on generated_forms for all
  using (claim_belongs_to_me(claim_id)) with check (claim_belongs_to_me(claim_id));
create policy "child: tasks" on tasks for all
  using (claim_belongs_to_me(claim_id)) with check (claim_belongs_to_me(claim_id));
create policy "child: claim_events" on claim_events for all
  using (claim_belongs_to_me(claim_id)) with check (claim_belongs_to_me(claim_id));

-- ---------- grants ----------
-- PostgREST needs explicit grants even with the service role key.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines  to anon, authenticated, service_role;
