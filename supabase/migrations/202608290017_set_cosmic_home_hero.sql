-- Publish the approved original cosmic hero as the current site background.
-- Admins can still replace it later from the system configuration page.
update public.system_config
set home_hero_image_url = '/images/matrix-nova-hero-v2.png'
where id = 1;
