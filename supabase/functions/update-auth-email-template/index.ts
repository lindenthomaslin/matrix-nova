import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character))
}

function createEmailTemplate(source: string) {
  const message = escapeHtml(source.trim() || '你的 Matrix Nova 验证码是：{{code}}')
    .replaceAll('{{code}}', '{{ .Token }}')
    .replaceAll('{{email}}', '{{ .Email }}')
    .replace(/\r?\n/g, '<br>')

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f8ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;color:#14213d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f8ff;padding:40px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(24,94,181,.14)"><tr><td style="padding:34px 38px 30px;background:linear-gradient(135deg,#0b57d0 0%,#3e8cff 55%,#9bd5ff 100%)"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:38px;height:38px;border-radius:12px;background:#fff;text-align:center;font-size:20px;font-weight:800;color:#0b57d0">H</td><td style="padding-left:12px;color:#fff;font-size:19px;font-weight:750">HackFlow <span style="opacity:.78;font-size:12px">2026</span></td></tr></table><p style="margin:26px 0 0;color:#eaf4ff;font-size:14px;line-height:1.7">每一个新想法，都值得一张通往未来的通行证。</p></td></tr><tr><td style="padding:36px 38px 20px"><p style="margin:0 0 10px;font-size:12px;font-weight:750;letter-spacing:1.6px;color:#4b84cf">VERIFY YOUR EMAIL</p><h1 style="margin:0;font-size:28px;line-height:1.25;color:#15284b">确认你的注册邮箱</h1><div style="margin:24px 0;padding:20px;border:1px solid #d9e9ff;border-radius:18px;background:linear-gradient(135deg,#f7fbff,#edf6ff);font-size:15px;line-height:1.85;color:#48617f">${message}</div><p style="margin:0;font-size:13px;line-height:1.75;color:#7686a0">验证码将在 10 分钟后失效。为了保障账户安全，请不要把它转发给他人。</p></td></tr><tr><td style="padding:20px 38px 32px"><div style="height:1px;background:#e9f0f9;margin-bottom:18px"></div><p style="margin:0;font-size:12px;line-height:1.7;color:#91a0b8">此邮件发送至 {{ .Email }}。若非你本人发起注册，可忽略此邮件。</p></td></tr></table><p style="margin:18px 0 0;font-size:12px;color:#94a5bd">© 2026 HackFlow · Build what’s next.</p></td></tr></table></body></html>`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const managementToken = Deno.env.get('HACKFLOW_MANAGEMENT_TOKEN')
    if (!managementToken) throw new Error('邮件模板同步服务尚未配置管理凭据。')

    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: authData, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !authData.user) throw new Error('未登录或登录已过期')
    const { data: caller, error: callerError } = await adminClient.from('profiles').select('role,status').eq('id', authData.user.id).single()
    if (callerError || caller?.role !== 'admin' || caller.status !== 'active') return Response.json({ error: '仅管理员可更新邮件模板' }, { status: 403, headers: corsHeaders })

    const { template } = await request.json()
    if (typeof template !== 'string' || template.length > 8000) throw new Error('邮件模板内容无效或过长。')
    const response = await fetch('https://api.supabase.com/v1/projects/nxliebelnhfibofftwbx/config/auth', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${managementToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailer_subjects_confirmation: '你的 Matrix Nova 注册验证码', mailer_otp_exp: 600, mailer_templates_confirmation_content: createEmailTemplate(template) }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message || '同步认证邮件模板失败。')
    }
    return Response.json({ ok: true }, { headers: corsHeaders })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: 400, headers: corsHeaders })
  }
})
