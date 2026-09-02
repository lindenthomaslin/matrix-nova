-- Editable public-site copy and administrator-managed image uploads.
alter table public.system_config
  add column if not exists site_subtitle text not null default '创新者黑客松',
  add column if not exists footer_content text not null default '© 2026 HackFlow. Build what matters.',
  add column if not exists home_about_label text not null default '从灵感到产品',
  add column if not exists home_about_title text not null default '一个周末，把',
  add column if not exists home_about_highlight text not null default '可能性变成现场。',
  add column if not exists home_about_description text not null default '没有预设答案，只有一群愿意从问题出发、快速协作、把想法做成真实原型的人。',
  add column if not exists home_feature_1_title text not null default '48 小时极限共创',
  add column if not exists home_feature_1_text text not null default '从灵感、组队到可运行原型，让每一次判断在真实反馈里发生。',
  add column if not exists home_feature_2_title text not null default '开放命题，不限边界',
  add column if not exists home_feature_2_text text not null default 'AI、创意工具、未来生产力与可持续科技，都可以成为你的起点。',
  add column if not exists home_feature_3_title text not null default '让作品被看见',
  add column if not exists home_feature_3_text text not null default '和伙伴、导师及评委面对面，用产品讲出你的下一种可能。';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 5242880;

drop policy if exists "admins upload site assets" on storage.objects;
create policy "admins upload site assets" on storage.objects for insert to authenticated
with check (bucket_id = 'site-assets' and public.is_admin());
drop policy if exists "admins update site assets" on storage.objects;
create policy "admins update site assets" on storage.objects for update to authenticated
using (bucket_id = 'site-assets' and public.is_admin()) with check (bucket_id = 'site-assets' and public.is_admin());
drop policy if exists "admins delete site assets" on storage.objects;
create policy "admins delete site assets" on storage.objects for delete to authenticated
using (bucket_id = 'site-assets' and public.is_admin());
drop policy if exists "public read site assets" on storage.objects;
create policy "public read site assets" on storage.objects for select to public using (bucket_id = 'site-assets');

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
  home_feature_3_title text, home_feature_3_text text, registration_open boolean
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
    home_feature_3_text, registration_open
  from public.system_config where id = 1 limit 1;
$$;
grant execute on function public.get_public_branding() to anon, authenticated;
