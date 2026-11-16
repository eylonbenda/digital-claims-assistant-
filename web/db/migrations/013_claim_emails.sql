-- 013: claim_emails — email sent to insurers from the app, and what comes back.
-- Spec: docs/superpowers/specs/2026-11-15-email-relay-phase1-design.md (amended
-- 2026-11-16: the app sends to the insurer directly).
--
-- agents.inbound_alias is the local part of the business's system address
-- (alias@in.<domain>): what it sends from and where replies arrive. It is a write
-- credential — anyone who knows it can put mail in that business's inbox — so it
-- is set by us, never by the agent, and a null alias means the feature is off.
-- agents.claims_mailbox is the business's existing claims address: copied on every
-- send, and sent a copy of every inbound message.
--
-- Safe to re-run. Apply by hand to dev AND prod (see docs/status.md promote checklist).

alter table agents add column if not exists claims_mailbox text;
alter table agents add column if not exists inbound_alias text;
create unique index if not exists agents_inbound_alias_key on agents (inbound_alias);

create table if not exists claim_emails (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  claim_id uuid references claims(id) on delete set null,      -- null = not filed on a claim yet
  direction text not null check (direction in ('outbound', 'inbound')),
  kind text not null default 'other' check (kind in ('business', 'insurer', 'other')),
  provider_id text unique,                                    -- the provider's id; idempotency key
  message_id text,                                            -- RFC 5322 Message-ID
  in_reply_to text,
  from_addr text not null,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text not null default '',
  text_body text,                                             -- plain text only; HTML is never stored
  match_method text check (match_method in ('subject_id', 'thread', 'manual')),
  attachments_dropped boolean not null default false,         -- over the size cap: stored without files
  delivery_failed boolean not null default false,             -- outbound: the provider reported a bounce
  received_at timestamptz not null default now()
);
create index if not exists claim_emails_agent_claim_idx on claim_emails (agent_id, claim_id, received_at desc);
create index if not exists claim_emails_message_id_idx on claim_emails (message_id);

create table if not exists claim_email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references claim_emails(id) on delete cascade,
  filename text not null,                                     -- as received; never used as a path
  mime text,
  size_bytes integer,
  storage_path text not null
);
create index if not exists claim_email_attachments_email_idx on claim_email_attachments (email_id);

alter table claim_emails enable row level security;
alter table claim_email_attachments enable row level security;

-- The agent reads its own rows through the auth client. Keyed on agent_id, not on
-- the claim, because an unfiled message has no claim. Writes go through the service
-- client only (no insert/update policy on purpose).
drop policy if exists "agent reads own emails" on claim_emails;
create policy "agent reads own emails" on claim_emails for select
  using (agent_id in (select id from agents where auth_user_id = auth.uid()));

drop policy if exists "agent reads own email attachments" on claim_email_attachments;
create policy "agent reads own email attachments" on claim_email_attachments for select
  using (email_id in (select id from claim_emails));

grant select on claim_emails, claim_email_attachments to authenticated;
grant all on claim_emails, claim_email_attachments to service_role;

insert into public.schema_migrations(version) values ('013') on conflict do nothing;
