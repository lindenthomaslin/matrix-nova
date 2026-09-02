-- Registration operations: availability switch, preserved archives, and roster preparation.
alter table public.system_config
  add column if not exists registration_open boolean not null default true;

create or replace function public.is_registration_open()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select registration_open from public.system_config where id = 1), true);
$$;
grant execute on function public.is_registration_open() to authenticated;

drop policy if exists "active users create own registration" on public.hackathon_register;
create policy "active users create own registration" on public.hackathon_register for insert to authenticated
with check (user_id = auth.uid() and public.is_active_user() and public.is_registration_open());

create table if not exists public.hackathon_registration_archives (
  id uuid primary key default gen_random_uuid(),
  archive_label text not null default '',
  archived_at timestamptz not null default now(),
  archived_by uuid references public.profiles(id) on delete set null,
  registration_data jsonb not null
);

alter table public.hackathon_registration_archives enable row level security;
drop policy if exists "admins manage registration archives" on public.hackathon_registration_archives;
create policy "admins manage registration archives" on public.hackathon_registration_archives for all to authenticated
using (public.is_admin()) with check (public.is_admin());
grant select, insert, delete on public.hackathon_registration_archives to authenticated;

create or replace function public.archive_and_clear_registrations(p_archive_label text default '')
returns integer
language plpgsql security definer set search_path = public
as $$
declare archived_count integer;
begin
  if not public.is_admin() then raise exception '仅管理员可以归档报名数据'; end if;
  insert into public.hackathon_registration_archives (archive_label, archived_by, registration_data)
  select coalesce(nullif(trim(p_archive_label), ''), '未命名活动归档'), auth.uid(), to_jsonb(r)
  from public.hackathon_register r;
  get diagnostics archived_count = row_count;
  delete from public.hackathon_register;
  return archived_count;
end;
$$;

create or replace function public.prepare_checkin_roster()
returns integer
language plpgsql security definer set search_path = public
as $$
declare roster_count integer;
begin
  if not public.is_admin() then raise exception '仅管理员可以准备签到名单'; end if;
  update public.hackathon_register
    set check_in_token = encode(gen_random_bytes(16), 'hex')
    where status = 'accepted' and check_in_token is null;
  select count(*) into roster_count from public.hackathon_register where status = 'accepted';
  return roster_count;
end;
$$;

grant execute on function public.archive_and_clear_registrations(text) to authenticated;
grant execute on function public.prepare_checkin_roster() to authenticated;

drop function if exists public.get_public_branding();
create or replace function public.get_public_branding()
returns table (
  auth_hero_image_url text, rules_content text, privacy_content text,
  captcha_enabled boolean, captcha_length smallint, captcha_charset text,
  captcha_primary_color text, captcha_background_color text, captcha_noise boolean,
  captcha_font_size smallint, site_name text, site_icon_url text,
  home_hero_image_url text, home_eyebrow text, home_title text,
  home_highlight text, home_subtitle text, home_cta_label text,
  home_event_date text, home_location text, home_capacity text, registration_open boolean
)
language sql stable security definer set search_path = public
as $$
  select auth_hero_image_url, rules_content, privacy_content,
    captcha_enabled, captcha_length, captcha_charset, captcha_primary_color,
    captcha_background_color, captcha_noise, captcha_font_size,
    site_name, site_icon_url, home_hero_image_url, home_eyebrow,
    home_title, home_highlight, home_subtitle, home_cta_label,
    home_event_date, home_location, home_capacity, registration_open
  from public.system_config where id = 1 limit 1;
$$;
grant execute on function public.get_public_branding() to anon, authenticated;
