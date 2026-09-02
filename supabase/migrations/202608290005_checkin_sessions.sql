-- Check-in sessions keep each event's roster distinct and avoid relying on pgcrypto helpers.
create table if not exists public.checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.checkin_sessions enable row level security;
drop policy if exists "admins manage checkin sessions" on public.checkin_sessions;
create policy "admins manage checkin sessions" on public.checkin_sessions for all to authenticated
using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.checkin_sessions to authenticated;

alter table public.hackathon_register
  add column if not exists checkin_session_id uuid references public.checkin_sessions(id) on delete set null;

create or replace function public.prepare_checkin_roster(p_session_name text default '')
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  roster_count integer;
  session_id uuid;
  session_name text;
begin
  if not public.is_admin() then raise exception '仅管理员可以准备签到名单'; end if;
  session_name := coalesce(nullif(trim(p_session_name), ''), 'HackFlow 现场签到');

  insert into public.checkin_sessions (name, created_by)
  values (session_name, auth.uid())
  returning id into session_id;

  update public.hackathon_register
    set check_in_token = coalesce(check_in_token, replace(gen_random_uuid()::text, '-', '')),
        checkin_session_id = session_id,
        checked_in_at = null,
        checked_in_by = null
    where status = 'accepted';

  get diagnostics roster_count = row_count;
  return roster_count;
end;
$$;

grant execute on function public.prepare_checkin_roster(text) to authenticated;
