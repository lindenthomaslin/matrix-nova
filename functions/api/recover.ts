import { enforceAuthRequest, enforceRateLimit, recordAuthFailure, recordAuthSuccess, type SecurityEnv } from '../_shared/security'

interface Env extends SecurityEnv {
  TURNSTILE_SECRET_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const limited = await enforceRateLimit(env, request, 'recover', 5)
  if (limited) return limited
  const blocked = await enforceAuthRequest(env, request, 'recover')
  if (blocked) return blocked
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.TURNSTILE_SECRET_KEY) return Response.json({ error: 'Server misconfigured' }, { status: 503 })
  let body: { email?: string; turnstileToken?: string; redirectTo?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }
  const email = body.email?.trim()
  if (!email || !body.turnstileToken) {
    await recordAuthFailure(env, request, 'recover', 'missing_input_or_captcha')
    return Response.json({ error: 'Email and CAPTCHA token are required' }, { status: 400 })
  }
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET_KEY)
  form.append('response', body.turnstileToken)
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) form.append('remoteip', ip)
  const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const result = await verification.json<{ success?: boolean }>()
  if (!result.success) {
    await recordAuthFailure(env, request, 'recover', 'captcha_failed')
    return Response.json({ error: 'CAPTCHA verification failed' }, { status: 403 })
  }
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, ...(body.redirectTo ? { redirect_to: body.redirectTo } : {}), gotrue_meta_security: { captcha_token: body.turnstileToken } }),
  })
  // Keep the same response for existing and unknown emails.
  if (!response.ok) {
    await recordAuthFailure(env, request, 'recover', 'recover_rejected')
    return Response.json({ success: false, message: '如果邮箱已注册，你会收到密码重置邮件。' }, { status: 200 })
  }
  await recordAuthSuccess(env, request, 'recover')
  return Response.json({ success: true, message: '如果邮箱已注册，你会收到密码重置邮件。' })
}
