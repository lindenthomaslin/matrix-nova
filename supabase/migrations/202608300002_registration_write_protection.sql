-- Registration submissions are final for participants. Only administrators can
-- update an existing row (for review/status operations).
drop policy if exists "active users update own registration or admins update all" on public.hackathon_register;
drop policy if exists "admins update registrations" on public.hackathon_register;
create policy "admins update registrations" on public.hackathon_register
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Keep oversized payloads out of the database even when a client bypasses the UI.
alter table public.hackathon_register
  drop constraint if exists hackathon_register_field_lengths_check,
  add constraint hackathon_register_field_lengths_check check (
    char_length(full_name) <= 60 and
    char_length(phone) <= 30 and
    char_length(applicant_email) <= 160 and
    char_length(identity_type) <= 40 and
    char_length(organization) <= 160 and
    char_length(team_name) <= 120 and
    char_length(track) <= 80 and
    char_length(bio) <= 100 and
    char_length(motivation) <= 100 and
    char_length(coalesce(parent_name, '')) <= 80 and
    char_length(coalesce(parent_phone, '')) <= 30 and
    char_length(coalesce(github_url, '')) <= 2048 and
    char_length(coalesce(portfolio_url, '')) <= 2048 and
    cardinality(skills) <= 20
  );

alter table public.hackathon_register
  drop constraint if exists hackathon_register_urls_http_check,
  add constraint hackathon_register_urls_http_check check (
    (github_url is null or github_url ~* '^https?://[^[:space:]]+$') and
    (portfolio_url is null or portfolio_url ~* '^https?://[^[:space:]]+$')
  );

-- Preserve the privilege guard for direct API calls and make the intended role
-- boundary explicit: regular users can never promote themselves to admin.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.status := old.status;
    new.is_owner := old.is_owner;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
