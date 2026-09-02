-- There can only ever be one permanent owner for this site.
create unique index if not exists profiles_single_site_owner
on public.profiles ((is_owner))
where is_owner = true;
