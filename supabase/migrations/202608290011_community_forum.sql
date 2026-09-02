-- Public community feed for active event participants.
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_posts_created_at_idx on public.community_posts (created_at desc);
alter table public.community_posts enable row level security;
drop policy if exists "active users read community posts" on public.community_posts;
create policy "active users read community posts" on public.community_posts for select to authenticated using (public.is_active_user());
drop policy if exists "active users create community posts" on public.community_posts;
create policy "active users create community posts" on public.community_posts for insert to authenticated with check (author_id = auth.uid() and public.is_active_user());
drop policy if exists "authors or admins delete community posts" on public.community_posts;
create policy "authors or admins delete community posts" on public.community_posts for delete to authenticated using (author_id = auth.uid() or public.is_admin());
grant select, insert, delete on public.community_posts to authenticated;

create or replace function public.get_community_posts()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'author_id',c.author_id,'content',c.content,'created_at',c.created_at,'nickname',p.nickname) order by c.created_at desc),'[]'::jsonb)
  from (select * from public.community_posts order by created_at desc limit 100) c join public.profiles p on p.id=c.author_id
  where public.is_active_user();
$$;
grant execute on function public.get_community_posts() to authenticated;
