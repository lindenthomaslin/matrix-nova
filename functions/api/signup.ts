import { enforceAuthRequest, enforceRateLimit, recordAuthFailure, recordAuthSuccess, type SecurityEnv } from '../_shared/security'

interface Env extends SecurityEnv {
  TURNSTILE_SECRET_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const limited = await enforceRateLimit(env, request, 'signup', 5)
  if (limited) return limited
  const blocked = await enforceAuthRequest(env, request, 'signup')
  if (blocked) return blocked
  const supabaseUrl = env.SUPABASE_URL
  const supabaseAnonKey = env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey || !env.TURNSTILE_SECRET_KEY) {
    return Response.json({ error: 'Server misconfigured' }, { status: 503 })
  }

  let body: { email?: string; password?: string; turnstileToken?: string; options?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = body.email?.trim().slice(0, 160)
  const password = body.password || ''
  const { turnstileToken, options } = body
  if (!email || !password || password.length > 128) {
    return Response.json({ error: 'Email and password are required' }, { status: 400 })
  }

  if (!turnstileToken) {
    await recordAuthFailure(env, request, 'signup', 'missing_captcha')
    return Response.json({ error: 'CAPTCHA token is required' }, { status: 400 })
  }
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET_KEY)
  form.append('response', turnstileToken)
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) form.append('remoteip', ip)
  const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const result = await verification.json<{ success?: boolean }>()
  if (!result.success) {
    await recordAuthFailure(env, request, 'signup', 'captcha_failed')
    return Response.json({ error: 'CAPTCHA verification failed' }, { status: 403 })
  }

  const signupPayload = {
    email,
    password,
    ...(options ? { options } : {}),
    gotrue_meta_security: { captcha_token: turnstileToken },
  }
  const supabaseResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify(signupPayload),
  })

  const data = await supabaseResponse.json<Record<string, unknown>>()

  if (!supabaseResponse.ok) {
    await recordAuthFailure(env, request, 'signup', 'signup_rejected')
    return Response.json(
      { error: 'Registration could not be completed. Please try again later.' },
      { status: 422 }
    )
  }

  const user = data as { id?: string; identities?: unknown[] }
  const hasIdentities = Array.isArray(user.identities) && user.identities.length > 0

  await recordAuthSuccess(env, request, 'signup')
  return Response.json({
    success: true,
    userId: hasIdentities ? user.id : null,
  })
}
