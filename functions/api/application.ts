import { appendSecurityEvent, enforceRateLimit, type SecurityEnv } from '../_shared/security'

interface Env extends SecurityEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

const MAX_BODY_BYTES = 24 * 1024
const MAX = { full_name: 60, phone: 30, applicant_email: 160, identity_type: 40, organization: 160, team_name: 120, track: 80, bio: 100, motivation: 100, parent_name: 80, parent_phone: 30, github_url: 2048, portfolio_url: 2048 }

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function validUrl(value: string) {
  if (!value) return true
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' } catch { return false }
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const limited = await enforceRateLimit(env, request, 'application', 5)
  if (limited) return limited
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return Response.json({ error: 'Server misconfigured' }, { status: 503 })
  const authHeader = request.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(authHeader)) return Response.json({ error: '请先登录后再提交报名。' }, { status: 401 })
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) return Response.json({ error: '提交内容过大。' }, { status: 413 })

  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } })
  if (!userResponse.ok) return Response.json({ error: '登录已失效，请重新登录。' }, { status: 401 })
  const user = await userResponse.json<{ id?: string }>()
  if (!user.id) return Response.json({ error: '登录状态无效。' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: '提交内容格式不正确。' }, { status: 400 }) }
  const skills = Array.isArray(body.skills) ? body.skills.filter(value => typeof value === 'string').map(value => String(value).trim()).filter(Boolean).slice(0, 20) : []
  if (skills.some(skill => skill.length > 50)) return Response.json({ error: '技能关键词过长。' }, { status: 400 })
  const payload = {
    user_id: user.id,
    full_name: text(body.full_name, MAX.full_name), gender: text(body.gender, 20), age: typeof body.age === 'number' ? body.age : null,
    education: text(body.education, 40), phone: text(body.phone, MAX.phone), applicant_email: text(body.applicant_email, MAX.applicant_email),
    identity_type: text(body.identity_type, MAX.identity_type), organization: text(body.organization, MAX.organization), participation_mode: text(body.participation_mode, 20),
    team_name: text(body.team_name, MAX.team_name), skills, track: text(body.track, MAX.track), bio: text(body.bio, MAX.bio), motivation: text(body.motivation, MAX.motivation),
    parent_name: text(body.parent_name, MAX.parent_name) || null, parent_phone: text(body.parent_phone, MAX.parent_phone) || null,
    rules_agreed: body.rules_agreed === true, guardian_agreed: body.guardian_agreed === true,
    github_url: text(body.github_url, MAX.github_url) || null, portfolio_url: text(body.portfolio_url, MAX.portfolio_url) || null,
  }
  if (!payload.full_name || !payload.phone || !payload.applicant_email || !payload.track || !payload.bio || !payload.motivation || !payload.rules_agreed) return Response.json({ error: '请完成所有必填信息。' }, { status: 400 })
  if (!validUrl(payload.github_url || '') || !validUrl(payload.portfolio_url || '')) return Response.json({ error: '链接必须以 http:// 或 https:// 开头。' }, { status: 400 })

  const existing = await fetch(`${env.SUPABASE_URL}/rest/v1/hackathon_register?select=id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader } })
  if (!existing.ok) return Response.json({ error: '无法读取报名状态，请稍后重试。' }, { status: 502 })
  const rows = await existing.json<unknown[]>()
  if (rows.length) return Response.json({ error: '报名提交后不可修改。' }, { status: 409 })

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/hackathon_register`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload),
  })
  if (!response.ok) {
    await appendSecurityEvent(env, request, 'request', 'failure', `报名提交失败：${response.status}`)
    return Response.json({ error: '报名提交失败，请稍后重试。' }, { status: response.status === 409 ? 409 : 422 })
  }
  const data = await response.json<unknown[]>()
  await appendSecurityEvent(env, request, 'request', 'success', '报名提交成功')
  return Response.json({ data: data[0] || null })
}
