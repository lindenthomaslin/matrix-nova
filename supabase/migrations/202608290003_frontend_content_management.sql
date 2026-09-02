-- Public-site content managed from the developer console.
alter table public.system_config
  add column if not exists site_name text not null default 'HackFlow',
  add column if not exists site_icon_url text not null default '',
  add column if not exists home_hero_image_url text not null default '',
  add column if not exists home_eyebrow text not null default '2026 创新者黑客松',
  add column if not exists home_title text not null default '把未完成的想法，',
  add column if not exists home_highlight text not null default '做成真实的未来。',
  add column if not exists home_subtitle text not null default '48 小时，跨越技术与创意。和优秀的伙伴一起，为真实世界创造值得被看见的产品。',
  add column if not exists home_cta_label text not null default '开始报名',
  add column if not exists home_event_date text not null default '10.16 — 10.18',
  add column if not exists home_location text not null default '上海 · 西岸',
  add column if not exists home_capacity text not null default '300 位创造者';

drop function if exists public.get_public_branding();
create or replace function public.get_public_branding()
returns table (
  auth_hero_image_url text,
  rules_content text,
  privacy_content text,
  captcha_enabled boolean,
  captcha_length smallint,
  captcha_charset text,
  captcha_primary_color text,
  captcha_background_color text,
  captcha_noise boolean,
  captcha_font_size smallint,
  site_name text,
  site_icon_url text,
  home_hero_image_url text,
  home_eyebrow text,
  home_title text,
  home_highlight text,
  home_subtitle text,
  home_cta_label text,
  home_event_date text,
  home_location text,
  home_capacity text
)
language sql stable security definer set search_path = public
as $$
  select auth_hero_image_url, rules_content, privacy_content,
    captcha_enabled, captcha_length, captcha_charset, captcha_primary_color,
    captcha_background_color, captcha_noise, captcha_font_size,
    site_name, site_icon_url, home_hero_image_url, home_eyebrow,
    home_title, home_highlight, home_subtitle, home_cta_label,
    home_event_date, home_location, home_capacity
  from public.system_config where id = 1 limit 1;
$$;

grant execute on function public.get_public_branding() to anon, authenticated;
