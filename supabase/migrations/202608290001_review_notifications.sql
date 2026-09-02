-- Review metadata used by the administrator review queue and status emails.
alter table public.hackathon_register
  add column if not exists rejection_reason text;

create index if not exists hackathon_register_rejection_idx
  on public.hackathon_register(status)
  where status = 'rejected';
