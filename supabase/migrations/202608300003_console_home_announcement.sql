-- A concise announcement shown on the signed-in participant console home.
alter table public.system_config
  add column if not exists dashboard_announcement text not null default '欢迎来到 Matrix Nova 控制台。请留意报名审核状态与赛事通知。';

drop function if exists public.get_public_branding();
create function public.get_public_branding()
returns table (
  auth_hero_image_url text, rules_content text, privacy_content text,
  captcha_enabled boolean, captcha_length smallint, captcha_charset text,
  captcha_primary_color text, captcha_background_color text, captcha_noise boolean,
  captcha_font_size smallint, site_name text, site_subtitle text, site_icon_url text,
  footer_content text, home_hero_image_url text, home_eyebrow text, home_title text,
  home_highlight text, home_subtitle text, home_cta_label text, home_event_date text,
  home_location text, home_capacity text, home_about_label text, home_about_title text,
  home_about_highlight text, home_about_description text, home_feature_1_title text,
  home_feature_1_text text, home_feature_2_title text, home_feature_2_text text,
  home_feature_3_title text, home_feature_3_text text, registration_open boolean,
  dashboard_announcement text
)
language sql stable security definer set search_path = public
as $$
  select auth_hero_image_url, rules_content, privacy_content, captcha_enabled, captcha_length,
    captcha_charset, captcha_primary_color, captcha_background_color, captcha_noise,
    captcha_font_size, site_name, site_subtitle, site_icon_url, footer_content,
    home_hero_image_url, home_eyebrow, home_title, home_highlight, home_subtitle,
    home_cta_label, home_event_date, home_location, home_capacity, home_about_label,
    home_about_title, home_about_highlight, home_about_description, home_feature_1_title,
    home_feature_1_text, home_feature_2_title, home_feature_2_text, home_feature_3_title,
    home_feature_3_text, registration_open, dashboard_announcement
  from public.system_config where id = 1 limit 1;
$$;

grant execute on function public.get_public_branding() to anon, authenticated;
