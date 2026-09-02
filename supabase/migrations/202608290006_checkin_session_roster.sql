-- Return the newly-created session so the client can immediately open its roster.
drop function if exists public.prepare_checkin_roster(text);
create function public.prepare_checkin_roster(p_session_name text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  roster_count integer;
  session_id uuid;
  session_name text;
begin
  if not public.is_admin() then raise exception '仅管理员可以准备签到名单'; end if;
  session_name := coalesce(nullif(trim(p_session_name), ''), 'HackFlow 现场签到');
  insert into public.checkin_sessions (name, created_by)
  values (session_name, auth.uid())
  returning id into session_id;

  update public.hackathon_register
    set check_in_token = coalesce(check_in_token, replace(gen_random_uuid()::text, '-', '')),
        checkin_session_id = session_id,
        checked_in_at = null,
        checked_in_by = null
    where status = 'accepted';
  get diagnostics roster_count = row_count;
  return jsonb_build_object('session_id', session_id, 'roster_count', roster_count);
end;
$$;
grant execute on function public.prepare_checkin_roster(text) to authenticated;
