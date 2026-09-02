-- Public branding used by login and registration pages. Only this single field is exposed.
alter table public.system_config
  add column if not exists auth_hero_image_url text not null default 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1800&q=85';

create or replace function public.get_public_branding()
returns table (auth_hero_image_url text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_hero_image_url, '')
  from public.system_config
  where id = 1
  limit 1;
$$;

grant execute on function public.get_public_branding() to anon, authenticated;
