-- Defense-in-depth for RPCs and anonymous analytics writes.
-- RLS remains the primary authorization boundary; this removes the default
-- PostgreSQL EXECUTE privilege that otherwise applies to PUBLIC.

drop policy if exists "public can record anonymous visit events" on public.site_visit_events;
create policy "public can record anonymous visit events" on public.site_visit_events
for insert to anon, authenticated
with check (user_id is null or user_id = auth.uid());

revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.get_my_account_state() from public, anon;
revoke execute on function public.is_registration_open() from public, anon;
revoke execute on function public.archive_and_clear_registrations(text) from public, anon;
revoke execute on function public.prepare_checkin_roster() from public, anon;
revoke execute on function public.prepare_checkin_roster(text) from public, anon;
revoke execute on function public.get_my_team() from public, anon;
revoke execute on function public.create_my_team(text) from public, anon;
revoke execute on function public.join_team_by_invite(text) from public, anon;
revoke execute on function public.transfer_my_team_leadership(uuid) from public, anon;
revoke execute on function public.leave_my_team() from public, anon;
revoke execute on function public.review_team_join_request(uuid, boolean) from public, anon;
revoke execute on function public.remove_my_team_member(uuid) from public, anon;
revoke execute on function public.admin_list_teams() from public, anon;
revoke execute on function public.admin_delete_team(uuid) from public, anon;
revoke execute on function public.get_community_posts() from public, anon;
revoke execute on function public.retract_my_community_post(uuid) from public, anon;
revoke execute on function public.admin_remove_community_post(uuid) from public, anon;
revoke execute on function public.get_admin_analytics() from public, anon;

grant execute on function public.is_active_user(), public.is_admin(), public.is_owner(), public.get_my_account_state(), public.is_registration_open(), public.archive_and_clear_registrations(text), public.prepare_checkin_roster(), public.prepare_checkin_roster(text), public.get_my_team(), public.create_my_team(text), public.join_team_by_invite(text), public.transfer_my_team_leadership(uuid), public.leave_my_team(), public.review_team_join_request(uuid, boolean), public.remove_my_team_member(uuid), public.admin_list_teams(), public.admin_delete_team(uuid), public.get_community_posts(), public.retract_my_community_post(uuid), public.admin_remove_community_post(uuid), public.get_admin_analytics() to authenticated;
