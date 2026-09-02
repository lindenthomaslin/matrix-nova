-- Apply the Matrix Nova brand to the existing public configuration and mail copy.
update public.system_config
set site_name = 'Matrix Nova',
    site_subtitle = '创新者黑客松',
    footer_content = '© 2026 Matrix Nova. Build what matters.',
    notification_template = replace(notification_template, 'HackFlow', 'Matrix Nova'),
    verification_email_template = replace(verification_email_template, 'HackFlow', 'Matrix Nova')
where id = 1;
