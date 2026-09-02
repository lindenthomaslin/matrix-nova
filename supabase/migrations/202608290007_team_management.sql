-- Team creation, invitation, membership and captain transfer.
create table if not exists public.hackathon_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 50),
  invite_code text not null unique,
  leader_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hackathon_team_members (
  team_id uuid not null references public.hackathon_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (user_id)
);

alter table public.hackathon_teams enable row level security;
alter table public.hackathon_team_members enable row level security;

create or replace function public.get_my_team()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id', t.id, 'name', t.name, 'invite_code', t.invite_code,
    'leader_id', t.leader_id, 'created_at', t.created_at,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'role', m.role, 'joined_at', m.joined_at,
      'nickname', p.nickname, 'email', p.email
    ) order by case when m.role = 'leader' then 0 else 1 end, m.joined_at)
      from public.hackathon_team_members m join public.profiles p on p.id = m.user_id
      where m.team_id = t.id), '[]'::jsonb)
  ) into result
  from public.hackathon_team_members mine join public.hackathon_teams t on t.id = mine.team_id
  where mine.user_id = auth.uid();
  return result;
end;
$$;

create or replace function public.create_my_team(p_name text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare team_id uuid; code text;
begin
  if not public.is_active_user() then raise exception '账号不可用'; end if;
  if exists (select 1 from public.hackathon_team_members where user_id = auth.uid()) then raise exception '你已加入一个队伍，请先退出当前队伍'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 50 then raise exception '队伍名称需要为 2 至 50 个字符'; end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.hackathon_teams (name, invite_code, leader_id) values (trim(p_name), code, auth.uid()) returning id into team_id;
  insert into public.hackathon_team_members (team_id, user_id, role) values (team_id, auth.uid(), 'leader');
  return public.get_my_team();
end;
$$;

create or replace function public.join_team_by_invite(p_invite_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare target_team uuid;
begin
  if not public.is_active_user() then raise exception '账号不可用'; end if;
  if exists (select 1 from public.hackathon_team_members where user_id = auth.uid()) then raise exception '你已加入一个队伍，请先退出当前队伍'; end if;
  select id into target_team from public.hackathon_teams where invite_code = upper(trim(p_invite_code));
  if target_team is null then raise exception '邀请码无效，请检查后重试'; end if;
  insert into public.hackathon_team_members (team_id, user_id) values (target_team, auth.uid());
  return public.get_my_team();
end;
$$;

create or replace function public.transfer_my_team_leadership(p_new_leader uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare team uuid;
begin
  select id into team from public.hackathon_teams where leader_id = auth.uid();
  if team is null then raise exception '只有队长可以转让队长身份'; end if;
  if not exists (select 1 from public.hackathon_team_members where team_id = team and user_id = p_new_leader and user_id <> auth.uid()) then raise exception '请选择当前队伍中的其他成员'; end if;
  update public.hackathon_teams set leader_id = p_new_leader, updated_at = now() where id = team;
  update public.hackathon_team_members set role = case when user_id = p_new_leader then 'leader' else 'member' end where team_id = team;
  return public.get_my_team();
end;
$$;

create or replace function public.leave_my_team()
returns void
language plpgsql security definer set search_path = public
as $$
declare team uuid; is_leader boolean; member_count integer;
begin
  select m.team_id, m.role = 'leader' into team, is_leader from public.hackathon_team_members m where m.user_id = auth.uid();
  if team is null then raise exception '你尚未加入队伍'; end if;
  select count(*) into member_count from public.hackathon_team_members where team_id = team;
  if is_leader and member_count > 1 then raise exception '请先转让队长身份后再退出队伍'; end if;
  if is_leader then delete from public.hackathon_teams where id = team;
  else delete from public.hackathon_team_members where team_id = team and user_id = auth.uid(); end if;
end;
$$;

grant execute on function public.get_my_team() to authenticated;
grant execute on function public.create_my_team(text) to authenticated;
grant execute on function public.join_team_by_invite(text) to authenticated;
grant execute on function public.transfer_my_team_leadership(uuid) to authenticated;
grant execute on function public.leave_my_team() to authenticated;
