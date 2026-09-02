-- HackFlow 2026: database schema, helper functions and RLS policies
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nickname text not null default '新用户',
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hackathon_register (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  full_name text not null,
  phone text not null,
  team_name text not null default '',
  skills text[] not null default '{}',
  track text not null,
  bio text not null,
  portfolio_url text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_config (
  id integer primary key default 1 check (id = 1),
  smtp_host text not null default '',
  smtp_port integer not null default 587 check (smtp_port between 1 and 65535),
  from_email text not null default '',
  smtp_username text not null default '',
  smtp_password text not null default '',
  notification_template text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists registrations_set_updated_at on public.hackathon_register;
create trigger registrations_set_updated_at before update on public.hackathon_register for each row execute function public.set_updated_at();
drop trigger if exists config_set_updated_at on public.system_config;
create trigger config_set_updated_at before update on public.system_config for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, nickname)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'nickname', split_part(coalesce(new.email, '新用户'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Backfill profiles when this migration is applied to a project with existing Auth users.
insert into public.profiles (id, email, nickname)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'nickname', split_part(coalesce(email, '新用户'), '@', 1))
from auth.users
on conflict (id) do nothing;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

-- The app calls this immediately after Auth sign-in. It is intentionally SECURITY DEFINER
-- so a banned account can learn only its own state and be signed out before RLS blocks all data.
create or replace function public.get_my_account_state()
returns setof public.profiles language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.status := old.status;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges before update on public.profiles for each row execute function public.protect_profile_privileges();

create or replace function public.protect_registration_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    else
      new.user_id := old.user_id;
      new.status := old.status;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_registration_privileges on public.hackathon_register;
create trigger protect_registration_privileges before insert or update on public.hackathon_register for each row execute function public.protect_registration_privileges();

alter table public.profiles enable row level security;
alter table public.hackathon_register enable row level security;
alter table public.system_config enable row level security;

drop policy if exists "active users read own profile or admins read all" on public.profiles;
create policy "active users read own profile or admins read all" on public.profiles for select to authenticated
using (public.is_admin() or (id = auth.uid() and public.is_active_user()));
drop policy if exists "active users update own profile or admins update all" on public.profiles;
create policy "active users update own profile or admins update all" on public.profiles for update to authenticated
using (public.is_admin() or (id = auth.uid() and public.is_active_user()))
with check (public.is_admin() or (id = auth.uid() and public.is_active_user()));
drop policy if exists "admins delete profiles" on public.profiles;
create policy "admins delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

drop policy if exists "active users read own registrations or admins read all" on public.hackathon_register;
create policy "active users read own registrations or admins read all" on public.hackathon_register for select to authenticated
using (public.is_admin() or (user_id = auth.uid() and public.is_active_user()));
drop policy if exists "active users create own registration" on public.hackathon_register;
create policy "active users create own registration" on public.hackathon_register for insert to authenticated
with check (user_id = auth.uid() and public.is_active_user());
drop policy if exists "active users update own registration or admins update all" on public.hackathon_register;
create policy "active users update own registration or admins update all" on public.hackathon_register for update to authenticated
using (public.is_admin() or (user_id = auth.uid() and public.is_active_user()))
with check (public.is_admin() or (user_id = auth.uid() and public.is_active_user()));
drop policy if exists "active users delete own registration or admins delete all" on public.hackathon_register;
drop policy if exists "admins delete registrations" on public.hackathon_register;
create policy "admins delete registrations" on public.hackathon_register for delete to authenticated using (public.is_admin());

drop policy if exists "admins manage system config" on public.system_config;
create policy "admins manage system config" on public.system_config for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.hackathon_register, public.system_config to authenticated;
grant execute on function public.get_my_account_state() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;

insert into public.system_config (id, notification_template)
values (1, E'你好 {{nickname}}，\n\n你的 HackFlow 2026 报名状态已更新为：{{status}}。\n\nHackFlow 赛事团队')
on conflict (id) do nothing;

-- After creating your first account, run this once in the SQL editor:
-- update public.profiles set role = 'admin' where email = 'your-admin@example.com';
