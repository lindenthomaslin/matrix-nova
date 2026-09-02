import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.10.1'

type Status = 'pending' | 'accepted' | 'rejected'
interface Body { registration_id?: string; status?: Status; rejection_reason?: string | null }
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders })
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char)

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: authData, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !authData.user) return json({ error: '未登录或登录已过期' }, 401)
    const { data: caller } = await adminClient.from('profiles').select('role,status').eq('id', authData.user.id).single()
    if (caller?.role !== 'admin' || caller?.status !== 'active') return json({ error: '仅管理员可发送审核通知' }, 403)

    const body = await request.json() as Body
    const status = body.status
    if (!body.registration_id || !status || !['pending', 'accepted', 'rejected'].includes(status)) return json({ error: '缺少有效的报名记录或审核状态' }, 400)
    if (status === 'rejected' && !body.rejection_reason?.trim()) return json({ error: '拒绝报名必须填写拒绝理由' }, 400)

    const { data: registration, error: registrationError } = await adminClient
      .from('hackathon_register')
      .select('id,full_name,applicant_email,user_id')
      .eq('id', body.registration_id)
      .single()
    if (registrationError || !registration) return json({ error: '找不到报名记录' }, 404)
    const { data: profile } = await adminClient.from('profiles').select('email,nickname').eq('id', registration.user_id).maybeSingle()
    const recipient = registration.applicant_email?.trim() || profile?.email?.trim()
    if (!recipient) return json({ error: '报名记录没有可用的收件邮箱' }, 400)

    const { data: config } = await adminClient.from('system_config').select('smtp_host,smtp_port,from_email,smtp_username,smtp_password,notification_template').eq('id', 1).maybeSingle()
    const host = config?.smtp_host || Deno.env.get('SMTP_HOST')
    const port = Number(config?.smtp_port || Deno.env.get('SMTP_PORT') || 465)
    const username = config?.smtp_username || Deno.env.get('SMTP_USERNAME')
    const password = config?.smtp_password || Deno.env.get('SMTP_PASSWORD')
    const from = config?.from_email || Deno.env.get('SMTP_FROM_EMAIL') || username
    if (!host || !username || !password || !from) return json({ error: '尚未配置 SMTP 发信信息' }, 503)

    const labels: Record<Status, string> = { pending: '待审核', accepted: '审核通过', rejected: '审核未通过' }
    const reason = body.rejection_reason?.trim() || ''
    const template = config?.notification_template?.trim() || '你好 {{nickname}}，\n\n你的 Matrix Nova 2026 报名状态已更新为：{{status}}。\n{{reason}}\n\nMatrix Nova 赛事团队'
    const rendered = template
      .replaceAll('{{nickname}}', profile?.nickname || registration.full_name || '参赛者')
      .replaceAll('{{full_name}}', registration.full_name || '')
      .replaceAll('{{status}}', labels[status])
      .replaceAll('{{reason}}', reason ? `\n拒绝理由：${reason}` : '')
    const subject = status === 'accepted' ? 'Matrix Nova 2026｜报名审核通过' : status === 'rejected' ? 'Matrix Nova 2026｜报名审核结果' : 'Matrix Nova 2026｜报名状态更新'
    const html = `<div style="margin:0;background:#eef6ff;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;color:#16345a"><div style="max-width:560px;margin:auto;border:1px solid #d6e8fb;border-radius:24px;background:#fff;padding:32px;box-shadow:0 16px 44px rgba(42,117,186,.12)"><div style="display:inline-block;border-radius:10px;background:#0b7cf3;color:#fff;padding:8px 11px;font-weight:700">HF</div><p style="margin:24px 0 8px;color:#6d8caf;font-size:12px;letter-spacing:.12em">HACKFLOW 2026 / REVIEW</p><h1 style="margin:0 0 20px;font-size:24px;color:#102d50">${escapeHtml(labels[status])}</h1><div style="border-radius:16px;background:#f4f9ff;padding:18px;white-space:pre-wrap;line-height:1.75;font-size:15px">${escapeHtml(rendered)}</div>${status === 'rejected' ? `<div style="margin-top:16px;border-left:3px solid #ef6a5b;padding:10px 14px;background:#fff5f3;color:#9c4037;font-size:14px"><strong>拒绝理由</strong><br>${escapeHtml(reason)}</div>` : ''}<p style="margin:24px 0 0;color:#7c98b6;font-size:12px">这是一封系统通知，请勿直接回复。</p></div></div>`

    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: username, pass: password } })
    await transporter.sendMail({ from: `Matrix Nova 2026 <${from}>`, to: recipient, subject, text: rendered, html })
    return json({ success: true, recipient })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '通知邮件发送失败' }, 502)
  }
})
