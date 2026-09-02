-- Team join requests require captain approval; administrators can review all teams.
alter table public.hackathon_team_members drop constraint if exists hackathon_team_members_role_check;
alter table public.hackathon_team_members add constraint hackathon_team_members_role_check check (role in ('leader', 'member', 'pending'));

create or replace function public.join_team_by_invite(p_invite_code text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare target_team uuid;
begin
  if not public.is_active_user() then raise exception '账号不可用'; end if;
  if exists (select 1 from public.hackathon_team_members where user_id = auth.uid()) then raise exception '你已加入或正在申请加入一个队伍'; end if;
  select id into target_team from public.hackathon_teams where invite_code = upper(trim(p_invite_code));
  if target_team is null then raise exception '邀请码无效，请检查后重试'; end if;
  insert into public.hackathon_team_members (team_id, user_id, role) values (target_team, auth.uid(), 'pending');
  return public.get_my_team();
end;
$$;

create or replace function public.get_my_team()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'invite_code', t.invite_code, 'leader_id', t.leader_id,
    'created_at', t.created_at, 'membership_role', mine.role,
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'joined_at',m.joined_at,'nickname',p.nickname,'email',p.email) order by case when m.role='leader' then 0 when m.role='member' then 1 else 2 end,m.joined_at) from public.hackathon_team_members m join public.profiles p on p.id=m.user_id where m.team_id=t.id), '[]'::jsonb)
  ) into result from public.hackathon_team_members mine join public.hackathon_teams t on t.id=mine.team_id where mine.user_id=auth.uid();
  return result;
end;
$$;

create or replace function public.review_team_join_request(p_user_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public
as $$ declare team uuid;
begin
  select id into team from public.hackathon_teams where leader_id=auth.uid();
  if team is null then raise exception '只有队长可以处理入队申请'; end if;
  if not exists(select 1 from public.hackathon_team_members where team_id=team and user_id=p_user_id and role='pending') then raise exception '未找到待处理的入队申请'; end if;
  if p_approve then update public.hackathon_team_members set role='member' where team_id=team and user_id=p_user_id;
  else delete from public.hackathon_team_members where team_id=team and user_id=p_user_id; end if;
  return public.get_my_team();
end;
$$;

create or replace function public.remove_my_team_member(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$ declare team uuid;
begin
  select id into team from public.hackathon_teams where leader_id=auth.uid();
  if team is null then raise exception '只有队长可以移除成员'; end if;
  if p_user_id=auth.uid() then raise exception '队长请使用退出或解散队伍操作'; end if;
  delete from public.hackathon_team_members where team_id=team and user_id=p_user_id;
  if not found then raise exception '未找到该队员'; end if;
  return public.get_my_team();
end;
$$;

create or replace function public.transfer_my_team_leadership(p_new_leader uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$ declare team uuid;
begin
  select id into team from public.hackathon_teams where leader_id = auth.uid();
  if team is null then raise exception '只有队长可以转让队长身份'; end if;
  if not exists (select 1 from public.hackathon_team_members where team_id=team and user_id=p_new_leader and role='member') then raise exception '请选择当前队伍中的正式队员'; end if;
  update public.hackathon_teams set leader_id=p_new_leader, updated_at=now() where id=team;
  update public.hackathon_team_members set role=case when user_id=p_new_leader then 'leader' else 'member' end where team_id=team;
  return public.get_my_team();
end;
$$;

create or replace function public.admin_list_teams()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'invite_code',t.invite_code,'leader_id',t.leader_id,'created_at',t.created_at,'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'nickname',p.nickname,'email',p.email)) from public.hackathon_team_members m join public.profiles p on p.id=m.user_id where m.team_id=t.id),'[]'::jsonb)) order by t.created_at desc),'[]'::jsonb) from public.hackathon_teams t where public.is_admin();
$$;
create or replace function public.admin_delete_team(p_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$ begin if not public.is_admin() then raise exception '仅管理员可以管理队伍'; end if; delete from public.hackathon_teams where id=p_team_id; end; $$;

grant execute on function public.join_team_by_invite(text), public.get_my_team(), public.review_team_join_request(uuid,boolean), public.remove_my_team_member(uuid), public.admin_list_teams(), public.admin_delete_team(uuid) to authenticated;
