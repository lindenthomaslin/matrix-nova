-- Make QR check-in atomic and independent of client-side table writes.
create or replace function public.admin_check_in_participant(
  p_checkin_token text,
  p_session_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  participant public.hackathon_register%rowtype;
  token text := trim(replace(coalesce(p_checkin_token, ''), 'HACKFLOW-CHECKIN:', ''));
begin
  if not public.is_admin() then raise exception '仅管理员可以执行签到'; end if;
  if p_session_id is null or token = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'message', '请提供有效的签到二维码和签到列表。');
  end if;

  select * into participant
  from public.hackathon_register
  where check_in_token = token and checkin_session_id = p_session_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', '未找到对应报名记录，请确认二维码属于当前签到列表。');
  end if;
  if participant.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'code', 'not_accepted', 'message', '该报名尚未审核通过，暂不能签到。');
  end if;
  if participant.checked_in_at is not null then
    return jsonb_build_object('ok', false, 'code', 'already_checked_in', 'name', participant.full_name, 'checked_in_at', participant.checked_in_at, 'message', participant.full_name || ' 已完成签到。');
  end if;

  update public.hackathon_register
  set checked_in_at = now(), checked_in_by = auth.uid()
  where id = participant.id;

  return jsonb_build_object('ok', true, 'code', 'checked_in', 'name', participant.full_name, 'message', participant.full_name || ' 签到成功。');
end;
$$;

revoke execute on function public.admin_check_in_participant(text, uuid) from public, anon;
grant execute on function public.admin_check_in_participant(text, uuid) to authenticated;
