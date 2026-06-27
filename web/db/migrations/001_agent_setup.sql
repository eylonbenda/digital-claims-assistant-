-- Migration 001: agent auto-creation trigger + insert policy.
-- Run in the Supabase SQL editor AFTER the initial schema (schema.sql).

-- Auto-create an agents row whenever a new auth user signs up.
-- security definer = runs as the function owner (postgres), bypassing RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agents (auth_user_id, email)
  values (new.id, new.email)
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backup: allow authenticated users to insert their own agent row
-- (covers edge cases where the trigger didn't fire, e.g. existing users).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'agents' and policyname = 'agent insert own row'
  ) then
    execute $policy$
      create policy "agent insert own row" on agents
        for insert with check (auth_user_id = auth.uid())
    $policy$;
  end if;
end;
$$;
