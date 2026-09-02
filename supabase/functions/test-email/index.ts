import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.10.1'

interface Body { recipient?: string }
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!supabaseUrl || !serviceRoleKey || !token) return json({ message: '未登录或登录已过期' }, 401)
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: authData, error: authError } = await adminClient.auth.getUser(token)
  if (authError || !authData.user) return json({ message: '未登录或登录已过期' }, 401)
  const { data: caller, error: callerError } = await adminClient.from('profiles').select('role,status').eq('id', authData.user.id).maybeSingle()
  if (callerError || caller?.role !== 'admin' || caller.status !== 'active') return json({ message: '仅管理员可发送测试邮件' }, 403)

  const body = await request.json<Body>().catch(() => ({}))
  const recipient = body.recipient?.trim()
  if (!recipient) return json({ message: '请提供收件地址' }, 400)
  if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return json({ message: '收件地址格式无效' }, 400)
  const host = Deno.env.get('SMTP_HOST')
  const port = Number(Deno.env.get('SMTP_PORT') || 465)
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const from = Deno.env.get('SMTP_FROM_EMAIL') || username
  if (!host || !username || !password || !from) return json({ message: 'Supabase SMTP 发信函数尚未配置环境变量。' }, 503)
  try {
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: username, pass: password } })
    await transporter.sendMail({ from: `Matrix Nova 2026 <${from}>`, to: recipient, subject: 'Matrix Nova SMTP 测试邮件', text: '这是一封 Matrix Nova SMTP 测试邮件。你的邮件发送配置已经生效。' })
    return json({ success: true })
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : 'SMTP 发送失败' }, 502)
  }
})
