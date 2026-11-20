-- NAME HERE / SUPABASE SETUP
-- Run this whole script in Supabase Dashboard > SQL Editor > New query.
-- It creates user profiles, tickets, ticket replies, admin access and Row Level Security.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  department text not null check (department in ('Website support','Payment support','Product support','Market support')),
  subject text not null check (char_length(subject) between 1 and 120),
  body text not null check (char_length(body) between 1 and 10000),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 10000),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()));
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, username)
  values (new.id, nullif(new.raw_user_meta_data->>'username',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles update own username" on public.profiles;
create policy "profiles update own username" on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "admins readable by self" on public.admin_users;
create policy "admins readable by self" on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "tickets read own or admin" on public.tickets;
create policy "tickets read own or admin" on public.tickets for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "tickets create own" on public.tickets;
create policy "tickets create own" on public.tickets for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "tickets update admin only" on public.tickets;
create policy "tickets update admin only" on public.tickets for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ticket messages read own ticket or admin" on public.ticket_messages;
create policy "ticket messages read own ticket or admin" on public.ticket_messages for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_id and t.user_id = (select auth.uid())
  )
);

drop policy if exists "ticket messages insert own ticket or admin" on public.ticket_messages;
create policy "ticket messages insert own ticket or admin" on public.ticket_messages for insert to authenticated
with check (
  user_id = (select auth.uid()) and (
    (is_admin = true and public.is_admin()) or
    (is_admin = false and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.user_id = (select auth.uid())
    ))
  )
);

-- Intentionally no browser-facing INSERT/UPDATE policy for admin_users.
-- Promote the first admin manually from SQL after they have registered:
-- insert into public.admin_users(user_id)
-- select id from auth.users where email = 'YOUR-ADMIN-EMAIL';
