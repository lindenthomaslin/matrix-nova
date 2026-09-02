-- Managed announcements for the participant console. Only active admins can
-- manage rows; the public reads only the single current announcement via RPC.
create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null default '最新公告' check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 1000),
  is_pinned boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

drop trigger if exists site_announcements_set_updated_at on public.site_announcements;
create trigger site_announcements_set_updated_at
before update on public.site_announcements
for each row execute function public.set_updated_at();

create index if not exists site_announcements_visible_order_idx
  on public.site_announcements (published, is_pinned desc, created_at desc);

alter table public.site_announcements enable row level security;
drop policy if exists "admins manage site announcements" on public.site_announcements;
create policy "admins manage site announcements" on public.site_announcements
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.site_announcements to authenticated;

-- Preserve the existing one-off console announcement as the first managed item.
insert into public.site_announcements (title, content, created_by)
select '最新公告', left(trim(dashboard_announcement), 1000), null
from public.system_config
where id = 1
  and length(trim(coalesce(dashboard_announcement, ''))) > 0
  and not exists (select 1 from public.site_announcements)
on conflict do nothing;

create or replace function public.admin_pin_announcement(p_announcement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '仅管理员可以置顶公告'; end if;
  if not exists (select 1 from public.site_announcements where id = p_announcement_id) then
    raise exception '公告不存在';
  end if;
  update public.site_announcements set is_pinned = false where is_pinned;
  update public.site_announcements set is_pinned = true where id = p_announcement_id;
end;
$$;

create or replace function public.get_latest_announcement()
returns table (id uuid, title text, content text, is_pinned boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, title, content, is_pinned, created_at
  from public.site_announcements
  where published = true
  order by is_pinned desc, created_at desc
  limit 1;
$$;

revoke execute on function public.admin_pin_announcement(uuid) from public, anon;
grant execute on function public.admin_pin_announcement(uuid) to authenticated;
revoke execute on function public.get_latest_announcement() from public;
grant execute on function public.get_latest_announcement() to anon, authenticated;
