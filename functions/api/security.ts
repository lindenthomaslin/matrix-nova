import { listSecurityData, manuallyAllow, manuallyBlock, removeAllowlist, removeBlock, type SecurityAllowlist, type SecurityBlock, type SecurityEnv, type SecurityEvent } from '../_shared/security'

interface Env extends SecurityEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

async function requireAdmin(request: Request, env: Env) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_my_account_state`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
  })
  if (!response.ok) return false
  const value = await response.json<unknown>()
  const account = Array.isArray(value) ? value[0] : value
  return Boolean(account && typeof account === 'object' && (account as { role?: string }).role === 'admin' && (account as { status?: string }).status === 'active')
}

function summarize(events: SecurityEvent[], blocks: SecurityBlock[]) {
  const now = Date.now()
  const today = events.filter(item => Date.parse(item.createdAt) >= new Date().setHours(0, 0, 0, 0))
  const recent = events.filter(item => Date.parse(item.createdAt) >= now - 30 * 60 * 1000)
  const week = events.filter(item => Date.parse(item.createdAt) >= now - 7 * 24 * 60 * 60 * 1000)
  const uniqueIps = new Set(week.map(item => item.ip).filter(ip => ip !== 'unknown'))
  const attacks = recent.filter(item => item.outcome === 'failure' || item.outcome === 'blocked')
  const machineMap = new Map<string, { value: string; requests: number; failures: number; lastSeen: string }>()
  for (const event of events) if (event.machine) {
    const current = machineMap.get(event.machine) || { value: event.machine, requests: 0, failures: 0, lastSeen: event.createdAt }
    current.requests += 1
    if (event.outcome === 'failure' || event.outcome === 'blocked') current.failures += 1
    if (Date.parse(event.createdAt) > Date.parse(current.lastSeen)) current.lastSeen = event.createdAt
    machineMap.set(event.machine, current)
  }
  const sourceMap = new Map<string, { ip: string; requests: number; failures: number; lastSeen: string; blocked: boolean }>()
  for (const event of week) {
    const current = sourceMap.get(event.ip) || { ip: event.ip, requests: 0, failures: 0, lastSeen: event.createdAt, blocked: false }
    current.requests += 1
    if (event.outcome === 'failure' || event.outcome === 'blocked') current.failures += 1
    if (Date.parse(event.createdAt) > Date.parse(current.lastSeen)) current.lastSeen = event.createdAt
    sourceMap.set(event.ip, current)
  }
  const activeBlocks = blocks.filter(block => Date.parse(block.expiresAt) > now)
  for (const source of sourceMap.values()) source.blocked = activeBlocks.some(block => block.type === 'ip' && block.value === source.ip)
  const trend = Array.from({ length: 14 }, (_, index) => {
    const start = new Date(now - (13 - index) * 24 * 60 * 60 * 1000); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(start.getDate() + 1)
    const day = events.filter(item => Date.parse(item.createdAt) >= start.getTime() && Date.parse(item.createdAt) < end.getTime())
    return { date: `${String(start.getMonth() + 1).padStart(2, '0')}/${String(start.getDate()).padStart(2, '0')}`, requests: day.length, attacks: day.filter(item => item.outcome === 'failure' || item.outcome === 'blocked').length }
  })
  return {
    todayRequests: today.length,
    uniqueIps7d: uniqueIps.size,
    requests30m: recent.length,
    activeAttacks: attacks.length,
    blockedIps: activeBlocks.filter(block => block.type === 'ip').length,
    knownMachines: machineMap.size,
    machineIds: [...machineMap.values()].sort((a, b) => b.requests - a.requests),
    trend,
    riskSources: [...sourceMap.values()].sort((a, b) => b.failures - a.failures || b.requests - a.requests).slice(0, 12),
  }
}

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!(await requireAdmin(request, env))) return Response.json({ error: '仅管理员可以查看安全中心' }, { status: 403 })
  const { events, blocks, allowlist } = await listSecurityData(env)
  const summary = summarize(events, blocks)
  const machineIds = summary.machineIds.map(machine => ({ ...machine, allowlisted: allowlist.some(entry => entry.type === 'machine' && entry.value === machine.value) }))
  return Response.json({ ...summary, machineIds, events: events.slice(-120).reverse(), blocks: blocks.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), allowlist })
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!(await requireAdmin(request, env))) return Response.json({ error: '仅管理员可以修改安全策略' }, { status: 403 })
  let body: { action?: string; id?: string; type?: SecurityBlock['type'] | SecurityAllowlist['type']; value?: string; reason?: string; label?: string; durationMinutes?: number }
  try { body = await request.json() } catch { return Response.json({ error: '请求格式不正确' }, { status: 400 }) }
  try {
    if (body.action === 'block' && body.type && body.value) {
      const block = await manuallyBlock(env, body.type, body.value, body.reason || '', Number(body.durationMinutes) || 60)
      return Response.json({ block })
    }
    if (body.action === 'unblock' && body.id) {
      await removeBlock(env, body.id)
      return Response.json({ success: true })
    }
    if (body.action === 'allow' && body.type && body.value) {
      const entry = await manuallyAllow(env, body.type, body.value, body.label || '')
      return Response.json({ entry })
    }
    if (body.action === 'remove_allow' && body.id) {
      await removeAllowlist(env, body.id)
      return Response.json({ success: true })
    }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '操作失败' }, { status: 400 }) }
  return Response.json({ error: '未知的安全策略操作' }, { status: 400 })
}
