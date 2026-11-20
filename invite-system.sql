-- Pussitini invite-only registration
-- Run in Supabase SQL Editor after the existing supabase-setup.sql.
create table if not exists public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  email text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

alter table public.registration_invites enable row level security;
-- No client policies: only the Edge Function's service-role client can access this table.

-- Prevent public direct signups. The Edge Function creates users only after validating an invite.
-- In Supabase Dashboard, also disable "Allow new users to sign up" under
-- Authentication > Sign In / Providers > Email (wording may vary).
