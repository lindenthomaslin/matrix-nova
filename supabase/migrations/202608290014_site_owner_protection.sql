-- The original administrator is the permanent site owner.  Other admins
-- retain operational access, but can never take over or disable this account.
alter table public.profiles
  add column if not exists is_owner boolean not null default false;

update public.profiles
set is_owner = true, role = 'admin', status = 'active'
where lower(email) = 'linruichengchina@gmail.com';

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and is_owner = true and status = 'active'
  );
$$;

-- This trigger also protects against service-role calls and Auth-user deletion
-- cascades, so it is not possible to bypass from an admin screen or API.
create or replace function public.protect_site_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_owner then
      raise exception '站点所有者账号不可删除';
    end if;
    return old;
  end if;

  if old.is_owner then
    if new.is_owner is distinct from true
       or new.role is distinct from 'admin'
       or new.status is distinct from 'active'
       or new.email is distinct from old.email then
      raise exception '站点所有者账号不可封禁、降级、删除或更换邮箱';
    end if;
  elsif new.is_owner and not public.is_owner() then
    raise exception '只有站点所有者可以变更所有者身份';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_site_owner on public.profiles;
create trigger protect_site_owner
before update or delete on public.profiles
for each row execute function public.protect_site_owner();

drop policy if exists "admins delete profiles" on public.profiles;
create policy "admins delete non-owner profiles" on public.profiles
for delete to authenticated
using (public.is_admin() and is_owner = false);

grant execute on function public.is_owner() to authenticated;
