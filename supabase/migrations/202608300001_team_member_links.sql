-- Extend core team profiles with optional public links.
alter table public.site_team_members
  add column if not exists website_url text,
  add column if not exists github_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_team_members_website_url_http_check'
      and conrelid = 'public.site_team_members'::regclass
  ) then
    alter table public.site_team_members
      add constraint site_team_members_website_url_http_check
      check (website_url is null or website_url ~* '^https?://[^[:space:]]+$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_team_members_github_url_http_check'
      and conrelid = 'public.site_team_members'::regclass
  ) then
    alter table public.site_team_members
      add constraint site_team_members_github_url_http_check
      check (github_url is null or github_url ~* '^https?://[^[:space:]]+$');
  end if;
end $$;

create or replace function public.get_public_team_page()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tagline', (select team_tagline from system_config where id = 1),
    'intro', (select team_intro from system_config where id = 1),
    'principles', (select team_principles from system_config where id = 1),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'role', role,
        'bio', bio,
        'image_url', image_url,
        'website_url', website_url,
        'github_url', github_url,
        'sort_order', sort_order
      ) order by sort_order, created_at)
      from site_team_members
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_public_team_page() to anon, authenticated;
