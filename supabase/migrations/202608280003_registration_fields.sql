-- Extended participant application fields.
alter table public.hackathon_register
  add column if not exists gender text not null default '',
  add column if not exists age smallint,
  add column if not exists education text not null default '',
  add column if not exists applicant_email text not null default '',
  add column if not exists identity_type text not null default '',
  add column if not exists organization text not null default '',
  add column if not exists participation_mode text not null default '个人参赛',
  add column if not exists motivation text not null default '',
  add column if not exists parent_name text,
  add column if not exists parent_phone text,
  add column if not exists github_url text,
  add column if not exists rules_agreed boolean not null default false,
  add column if not exists guardian_agreed boolean not null default false,
  add column if not exists submitted_at timestamptz not null default timezone('utc', now());

alter table public.hackathon_register
  drop constraint if exists hackathon_register_age_check,
  add constraint hackathon_register_age_check check (age is null or (age >= 1 and age <= 120)),
  drop constraint if exists hackathon_register_participation_mode_check,
  add constraint hackathon_register_participation_mode_check check (participation_mode in ('个人参赛', '寻找队友'));

create index if not exists hackathon_register_status_idx on public.hackathon_register(status);
create index if not exists hackathon_register_submitted_at_idx on public.hackathon_register(submitted_at desc);

alter table public.system_config
  add column if not exists rules_content text not null default '请遵守赛事规则，提交真实、准确的报名信息，并尊重其他参赛者。',
  add column if not exists privacy_content text not null default '我们仅会使用报名信息进行资格审核、赛事联络与活动组织，不会将其用于无关用途。',
  add column if not exists verification_email_template text not null default '你的 HackFlow 验证码是：{{code}}\n\n验证码 10 分钟内有效，请勿转发给他人。',
  add column if not exists captcha_enabled boolean not null default true,
  add column if not exists captcha_length smallint not null default 4,
  add column if not exists captcha_charset text not null default 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  add column if not exists captcha_primary_color text not null default '#e49a57',
  add column if not exists captcha_background_color text not null default '#242022',
  add column if not exists captcha_noise boolean not null default true,
  add column if not exists captcha_font_size smallint not null default 24;

drop function if exists public.get_public_branding();
create or replace function public.get_public_branding()
returns table (auth_hero_image_url text, rules_content text, privacy_content text, captcha_enabled boolean, captcha_length smallint, captcha_charset text, captcha_primary_color text, captcha_background_color text, captcha_noise boolean, captcha_font_size smallint)
language sql stable security definer set search_path = public
as $$
  select coalesce(auth_hero_image_url, ''), coalesce(rules_content, ''), coalesce(privacy_content, ''), captcha_enabled, captcha_length, captcha_charset, captcha_primary_color, captcha_background_color, captcha_noise, captcha_font_size
  from public.system_config where id = 1 limit 1;
$$;

grant execute on function public.get_public_branding() to anon, authenticated;
