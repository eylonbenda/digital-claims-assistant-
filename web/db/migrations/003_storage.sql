-- 003_storage.sql — private Storage bucket for claimant-uploaded documents
-- (car photos, driver's licence, vehicle registration, third-party docs).
-- Run after schema.sql. The claim_documents table (schema.sql) records {type, storage_path, mime};
-- this creates the bucket those paths live in.
--
-- Access model: the claimant is unauthenticated and uploads through the token-gated server route
-- (POST /api/claims/documents) using the SERVICE ROLE, which bypasses Storage RLS. Agents read the
-- same way (server-mediated / signed URLs). So the bucket is PRIVATE with no public policies.
-- If you later read objects directly from an authenticated client, add storage.objects policies then.

insert into storage.buckets (id, name, public)
values ('claim-docs', 'claim-docs', false)
on conflict (id) do nothing;
