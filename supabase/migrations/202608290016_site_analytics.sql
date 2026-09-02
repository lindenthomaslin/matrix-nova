-- Lightweight, privacy-conscious first-party visit analytics.  We store an
-- anonymous browser identifier and route only; no IP address or fingerprint.
create table if not exists public.site_visit_events (
  id bigint generated always as identity primary key,
  visitor_id text not null check (char_length(visitor_id) between 12 and 80),
  user_id uuid references public.profiles(id) on delete set null,
  path text not null check (char_length(path) between 1 and 180),
  visited_at timestamptz not null default now()
);

create index if not exists site_visit_events_visited_at_idx on public.site_visit_events (visited_at desc);
create index if not exists site_visit_events_visitor_idx on public.site_visit_events (visitor_id, visited_at desc);

alter table public.site_visit_events enable row level security;

create policy "public can record anonymous visit events" on public.site_visit_events
for insert to anon, authenticated with check (true);

create policy "admins can read visit events" on public.site_visit_events
for select to authenticated using (public.is_admin());

create or replace function public.get_admin_analytics()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception '仅管理员可以查看运营数据';
  end if;

  select jsonb_build_object(
    'visitors_today', (select count(distinct visitor_id) from public.site_visit_events where visited_at >= date_trunc('day', now())),
    'page_views_today', (select count(*) from public.site_visit_events where visited_at >= date_trunc('day', now())),
    'online_visitors', (select count(distinct visitor_id) from public.site_visit_events where visited_at >= now() - interval '5 minutes'),
    'registered_users', (select count(*) from public.profiles),
    'registrations_total', (select count(*) from public.hackathon_register),
    'registrations_pending', (select count(*) from public.hackathon_register where status = 'pending'),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object('date', to_char(d.day, 'MM/DD'), 'visitors', coalesce(x.visitors, 0), 'views', coalesce(x.views, 0)) order by d.day)
      from generate_series(current_date - interval '6 days', current_date, interval '1 day') as d(day)
      left join lateral (
        select count(distinct visitor_id)::int as visitors, count(*)::int as views
        from public.site_visit_events
        where visited_at >= d.day and visited_at < d.day + interval '1 day'
      ) x on true
    ), '[]'::jsonb),
    'top_pages', coalesce((
      select jsonb_agg(jsonb_build_object('path', path, 'views', views) order by views desc)
      from (
        select path, count(*)::int as views
        from public.site_visit_events
        where visited_at >= now() - interval '7 days'
        group by path order by views desc limit 5
      ) p
    ), '[]'::jsonb),
    'generated_at', now()
  ) into result;
  return result;
end;
$$;

grant insert on public.site_visit_events to anon, authenticated;
grant select on public.site_visit_events to authenticated;
grant execute on function public.get_admin_analytics() to authenticated;

alter publication supabase_realtime add table public.site_visit_events;
