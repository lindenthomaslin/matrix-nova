-- Chat replies, recalls and visible moderator removals.
alter table public.community_posts
  alter column content drop not null,
  add column if not exists reply_to uuid references public.community_posts(id) on delete set null,
  add column if not exists retracted_at timestamptz,
  add column if not exists admin_deleted_at timestamptz,
  add column if not exists admin_deleted_by uuid references public.profiles(id) on delete set null;
alter table public.community_posts drop constraint if exists community_posts_content_check;
alter table public.community_posts add constraint community_posts_content_check check (retracted_at is not null or admin_deleted_at is not null or char_length(trim(coalesce(content,''))) between 1 and 100);

create or replace function public.retract_my_community_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.community_posts set content = null, retracted_at = now(), updated_at = now()
  where id = p_post_id and author_id = auth.uid() and retracted_at is null and admin_deleted_at is null;
  if not found then raise exception '只能撤回自己的有效消息'; end if;
end; $$;

create or replace function public.admin_remove_community_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception '仅管理员可以删除消息'; end if;
  update public.community_posts set content = null, admin_deleted_at = now(), admin_deleted_by = auth.uid(), updated_at = now()
  where id = p_post_id and admin_deleted_at is null;
  if not found then raise exception '消息不存在或已被删除'; end if;
end; $$;

create or replace function public.get_community_posts()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'author_id',c.author_id,'content',c.content,'created_at',c.created_at,'nickname',p.nickname,'reply_to',c.reply_to,'reply_nickname',rp.nickname,'reply_content',r.content,'retracted_at',c.retracted_at,'admin_deleted_at',c.admin_deleted_at) order by c.created_at asc),'[]'::jsonb)
  from (select * from public.community_posts order by created_at desc limit 200) c
  join public.profiles p on p.id=c.author_id
  left join public.community_posts r on r.id=c.reply_to
  left join public.profiles rp on rp.id=r.author_id
  where public.is_active_user();
$$;
grant execute on function public.retract_my_community_post(uuid), public.admin_remove_community_post(uuid), public.get_community_posts() to authenticated;
