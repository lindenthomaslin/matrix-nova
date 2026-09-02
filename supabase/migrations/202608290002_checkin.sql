-- Check-in token and audit fields for accepted participants.
alter table public.hackathon_register
  add column if not exists check_in_token text,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles(id) on delete set null;

update public.hackathon_register
set check_in_token = encode(gen_random_bytes(16), 'hex')
where check_in_token is null;

alter table public.hackathon_register
  alter column check_in_token set default encode(gen_random_bytes(16), 'hex');

create unique index if not exists hackathon_register_check_in_token_idx
  on public.hackathon_register(check_in_token);
