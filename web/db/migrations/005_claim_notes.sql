-- Migration 005: agent notes on a claim.
-- Run AFTER 004_doc_types_and_claim_flags.sql.
-- Free-text state-of-play notes ("דיברתי עם המוסך, חשבונית ביום ג'") so the
-- agent's working memory lives in the case file instead of WhatsApp.

create table if not exists claim_notes (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists claim_notes_claim_id_idx on claim_notes (claim_id, created_at desc);

alter table claim_notes enable row level security;

-- Same child-table policy as claim_documents / generated_forms.
-- Postgres has no `create policy if not exists`, so drop first — this migration is
-- applied by hand and must stay safe to re-run over a schema.sql that already has it.
drop policy if exists "child: claim_notes" on claim_notes;
create policy "child: claim_notes" on claim_notes for all
  using (claim_belongs_to_me(claim_id)) with check (claim_belongs_to_me(claim_id));
