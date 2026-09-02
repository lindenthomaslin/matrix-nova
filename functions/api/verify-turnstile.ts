export const onRequestPost = async ({ request, env }: { request: Request; env: { TURNSTILE_SECRET_KEY?: string } }) => {
  if (!env.TURNSTILE_SECRET_KEY) return new Response('Turnstile secret is not configured', { status: 503 })
  const body = await request.json<{ token?: string }>().catch(() => ({}))
  if (!body.token) return new Response('Missing token', { status: 400 })
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET_KEY)
  form.append('response', body.token)
  const forwarded = request.headers.get('CF-Connecting-IP')
  if (forwarded) form.append('remoteip', forwarded)
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const data = await result.json<{ success?: boolean }>()
  return Response.json({ success: Boolean(data.success) }, { status: data.success ? 200 : 403 })
}
