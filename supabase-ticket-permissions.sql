-- POSSUTLU: SUPPORT TICKETS PERMISSIONS + POLICIES
-- Run once in Supabase Dashboard > SQL Editor > New query.
-- Safe to re-run: policies are dropped/recreated and grants are idempotent.

-- Browser users need SQL privileges; RLS below controls which rows they can access.
grant usage on schema public to authenticated;
grant select, insert, update on table public.tickets to authenticated;
grant select, insert on table public.ticket_messages to authenticated;
grant select on table public.admin_users to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.admin_users enable row level security;

-- A user can see their own tickets; an admin can see every ticket.
drop policy if exists "tickets read own or admin" on public.tickets;
create policy "tickets read own or admin"
on public.tickets for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());

-- A user can create a ticket only for themselves.
drop policy if exists "tickets create own" on public.tickets;
create policy "tickets create own"
on public.tickets for insert to authenticated
with check (user_id = (select auth.uid()));

-- Only admins can change ticket status or other ticket fields.
drop policy if exists "tickets update admin only" on public.tickets;
create policy "tickets update admin only"
on public.tickets for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Ticket messages: owner of the parent ticket and admins can read.
drop policy if exists "ticket messages read own ticket or admin" on public.ticket_messages;
create policy "ticket messages read own ticket or admin"
on public.ticket_messages for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tickets t
    where t.id = ticket_messages.ticket_id
      and t.user_id = (select auth.uid())
  )
);

-- Customers can reply to their own ticket; admins can reply to any ticket.
-- The is_admin flag cannot be spoofed by an ordinary user.
drop policy if exists "ticket messages insert own ticket or admin" on public.ticket_messages;
create policy "ticket messages insert own ticket or admin"
on public.ticket_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (is_admin = true and public.is_admin())
    or
    (is_admin = false and exists (
      select 1
      from public.tickets t
      where t.id = ticket_messages.ticket_id
        and t.user_id = (select auth.uid())
    ))
  )
);

-- Admin list lookup: users can only see their own admin_users row.
drop policy if exists "admins readable by self" on public.admin_users;
create policy "admins readable by self"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

-- Do not grant INSERT/UPDATE/DELETE on admin_users to browser users.
-- Promote administrators only from the SQL Editor using a trusted project owner account.
