type KVStore = {
  get<T = unknown>(key: string, type?: 'json'): Promise<T | null>
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

export interface SecurityEnv {
  SECURITY_KV?: KVStore
}

export type SecurityEvent = {
  id: string
  action: 'login' | 'signup' | 'recover' | 'request'
  path: string
  ip: string
  machine: string | null
  outcome: 'attempt' | 'success' | 'failure' | 'blocked'
  reason?: string
  createdAt: string
}

export type SecurityBlock = {
  id: string
  type: 'ip' | 'machine'
  value: string
  reason: string
  createdAt: string
  expiresAt: string
  automatic?: boolean
}
export type SecurityAllowlist = { id: string; type: 'ip' | 'machine'; value: string; label: string; createdAt: string }

const EVENTS_KEY = 'security:events'
const BLOCKS_KEY = 'security:blocks'
const ALLOWLIST_KEY = 'security:allowlist'
const WINDOW_SECONDS = 10 * 60
const MAX_FAILURES = 8
const AUTO_BLOCK_SECONDS = 30 * 60
const RATE_LIMIT_WINDOW_SECONDS = 60

function encoded(value: string) {
  return encodeURIComponent(value.slice(0, 160))
}

function requestIp(request: Request) {
  return (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown').split(',')[0].trim().slice(0, 160)
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function machineHash(request: Request) {
  const cookieId = request.headers.get('Cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('matrix-nova-client-id='))?.slice('matrix-nova-client-id='.length)
  const clientId = (request.headers.get('X-Client-ID')?.trim() || cookieId)?.slice(0, 160)
  return clientId ? digest(clientId) : null
}

async function readEvents(kv: KVStore) {
  return (await kv.get<SecurityEvent[]>(EVENTS_KEY, 'json')) || []
}

async function readBlocks(kv: KVStore) {
  return (await kv.get<SecurityBlock[]>(BLOCKS_KEY, 'json')) || []
}

async function readAllowlist(kv: KVStore) {
  return (await kv.get<SecurityAllowlist[]>(ALLOWLIST_KEY, 'json')) || []
}

async function writeEvents(kv: KVStore, events: SecurityEvent[]) {
  await kv.put(EVENTS_KEY, JSON.stringify(events.slice(-600)))
}

async function writeBlocks(kv: KVStore, blocks: SecurityBlock[]) {
  await kv.put(BLOCKS_KEY, JSON.stringify(blocks.slice(-300)))
}

async function writeAllowlist(kv: KVStore, entries: SecurityAllowlist[]) {
  await kv.put(ALLOWLIST_KEY, JSON.stringify(entries.slice(-300)))
}

async function isAllowlisted(env: SecurityEnv, type: SecurityAllowlist['type'], value: string) {
  if (!env.SECURITY_KV || !value) return false
  const entries = await readAllowlist(env.SECURITY_KV)
  return entries.some(entry => entry.type === type && entry.value === value)
}

export function getClientIp(request: Request) {
  return requestIp(request)
}

export async function appendSecurityEvent(env: SecurityEnv, request: Request, action: SecurityEvent['action'], outcome: SecurityEvent['outcome'], reason?: string) {
  if (!env.SECURITY_KV) return
  const event: SecurityEvent = {
    id: crypto.randomUUID(),
    action,
    path: new URL(request.url).pathname,
    ip: requestIp(request),
    machine: await machineHash(request),
    outcome,
    ...(reason ? { reason: reason.slice(0, 180) } : {}),
    createdAt: new Date().toISOString(),
  }
  const events = await readEvents(env.SECURITY_KV)
  await writeEvents(env.SECURITY_KV, [...events, event])
}

async function activeBlock(env: SecurityEnv, type: SecurityBlock['type'], value: string) {
  if (!env.SECURITY_KV || !value || value === 'unknown') return null
  const key = `security:block:${type}:${encoded(value)}`
  const direct = await env.SECURITY_KV.get<SecurityBlock>(key, 'json')
  if (!direct) return null
  if (Date.parse(direct.expiresAt) <= Date.now()) {
    await env.SECURITY_KV.delete(key)
    return null
  }
  return direct
}

export async function activeRequestBlock(env: SecurityEnv, request: Request) {
  const ip = requestIp(request)
  const machine = await machineHash(request)
  if (await isAllowlisted(env, 'ip', ip) || (machine && await isAllowlisted(env, 'machine', machine))) return null
  return (await activeBlock(env, 'ip', ip)) || (machine ? await activeBlock(env, 'machine', machine) : null)
}

async function putBlock(env: SecurityEnv, block: SecurityBlock) {
  if (!env.SECURITY_KV) return
  await env.SECURITY_KV.put(`security:block:${block.type}:${encoded(block.value)}`, JSON.stringify(block), { expirationTtl: Math.max(60, Math.ceil((Date.parse(block.expiresAt) - Date.now()) / 1000)) })
  const blocks = await readBlocks(env.SECURITY_KV)
  const next = blocks.filter(item => item.id !== block.id && Date.parse(item.expiresAt) > Date.now())
  await writeBlocks(env.SECURITY_KV, [...next, block])
}

export async function enforceAuthRequest(env: SecurityEnv, request: Request, action: SecurityEvent['action']) {
  if (!env.SECURITY_KV) return null
  const ip = requestIp(request)
  const machine = await machineHash(request)
  const ipBlock = await activeBlock(env, 'ip', ip)
  const machineBlock = machine ? await activeBlock(env, 'machine', machine) : null
  const block = ipBlock || machineBlock
  if (block) {
    await appendSecurityEvent(env, request, action, 'blocked', block.reason)
    const retryAfter = Math.max(1, Math.ceil((Date.parse(block.expiresAt) - Date.now()) / 1000))
    return Response.json({ error: '访问频率过高，当前访问已暂时受限。', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
  }
  await appendSecurityEvent(env, request, action, 'attempt')
  return null
}

/** Fixed-window per-IP limiter for write endpoints. */
export async function enforceRateLimit(env: SecurityEnv, request: Request, bucketName: string, maxRequests = 5) {
  if (!env.SECURITY_KV) return null
  const ip = requestIp(request)
  const bucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000))
  const key = `security:rate:${bucketName}:${encoded(ip)}:${bucket}`
  const count = Number(await env.SECURITY_KV.get(key, 'text') || 0) + 1
  await env.SECURITY_KV.put(key, String(count), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 10 })
  if (count <= maxRequests) return null
  const retryAfter = RATE_LIMIT_WINDOW_SECONDS - Math.floor((Date.now() / 1000) % RATE_LIMIT_WINDOW_SECONDS)
  await appendSecurityEvent(env, request, 'request', 'blocked', `IP 每分钟最多 ${maxRequests} 次请求`)
  return Response.json({ error: '提交过于频繁，请稍后再试。', retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } })
}

async function incrementFailure(env: SecurityEnv, kind: 'ip' | 'machine', value: string) {
  if (!env.SECURITY_KV || !value || value === 'unknown') return 0
  const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000))
  const key = `security:failures:${kind}:${encoded(value)}:${bucket}`
  const current = Number(await env.SECURITY_KV.get(key, 'text') || 0) + 1
  await env.SECURITY_KV.put(key, String(current), { expirationTtl: WINDOW_SECONDS + 30 })
  return current
}

export async function recordAuthFailure(env: SecurityEnv, request: Request, action: SecurityEvent['action'], reason: string) {
  if (!env.SECURITY_KV) return false
  const ip = requestIp(request)
  const machine = await machineHash(request)
  await appendSecurityEvent(env, request, action, 'failure', reason)
  const ipFailures = await incrementFailure(env, 'ip', ip)
  const machineFailures = machine ? await incrementFailure(env, 'machine', machine) : 0
  if (ipFailures < MAX_FAILURES && machineFailures < MAX_FAILURES) return false
  const now = Date.now()
  const block: SecurityBlock = {
    id: crypto.randomUUID(),
    type: ipFailures >= MAX_FAILURES ? 'ip' : 'machine',
    value: ipFailures >= MAX_FAILURES ? ip : machine!,
    reason: `10 分钟内连续失败 ${Math.max(ipFailures, machineFailures)} 次，系统自动限制访问`,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + AUTO_BLOCK_SECONDS * 1000).toISOString(),
    automatic: true,
  }
  await putBlock(env, block)
  return true
}

export async function recordAuthSuccess(env: SecurityEnv, request: Request, action: SecurityEvent['action']) {
  await appendSecurityEvent(env, request, action, 'success')
}

export async function listSecurityData(env: SecurityEnv) {
  if (!env.SECURITY_KV) return { events: [], blocks: [], allowlist: [] }
  const [events, blocks, allowlist] = await Promise.all([readEvents(env.SECURITY_KV), readBlocks(env.SECURITY_KV), readAllowlist(env.SECURITY_KV)])
  const now = Date.now()
  return {
    events: events.filter(item => Date.parse(item.createdAt) > now - 14 * 24 * 60 * 60 * 1000),
    blocks: blocks.filter(item => Date.parse(item.expiresAt) > now),
    allowlist,
  }
}

export async function manuallyBlock(env: SecurityEnv, type: SecurityBlock['type'], value: string, reason: string, durationMinutes: number) {
  const normalized = value.trim().slice(0, 160)
  if (!normalized) throw new Error('请输入要限制的 IP 或设备标识')
  if (type === 'ip' && normalized.length < 3) throw new Error('IP 地址格式不正确')
  const now = Date.now()
  const block: SecurityBlock = {
    id: crypto.randomUUID(), type, value: normalized, reason: reason.trim().slice(0, 180) || '管理员手动限制',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + Math.min(Math.max(durationMinutes, 5), 7 * 24 * 60) * 60 * 1000).toISOString(),
  }
  await putBlock(env, block)
  return block
}

export async function removeBlock(env: SecurityEnv, id: string) {
  if (!env.SECURITY_KV) return
  const blocks = await readBlocks(env.SECURITY_KV)
  const block = blocks.find(item => item.id === id)
  if (block) await env.SECURITY_KV.delete(`security:block:${block.type}:${encoded(block.value)}`)
  await writeBlocks(env.SECURITY_KV, blocks.filter(item => item.id !== id))
}

export async function manuallyAllow(env: SecurityEnv, type: SecurityAllowlist['type'], value: string, label: string) {
  if (!env.SECURITY_KV) throw new Error('安全存储未配置')
  const normalized = value.trim().slice(0, 160)
  if (!normalized) throw new Error('请输入要免封的 IP 或设备标识')
  const entries = await readAllowlist(env.SECURITY_KV)
  const existing = entries.find(item => item.type === type && item.value === normalized)
  if (existing) return existing
  const entry: SecurityAllowlist = { id: crypto.randomUUID(), type, value: normalized, label: label.trim().slice(0, 80) || '可信设备', createdAt: new Date().toISOString() }
  await writeAllowlist(env.SECURITY_KV, [...entries, entry])
  return entry
}

export async function removeAllowlist(env: SecurityEnv, id: string) {
  if (!env.SECURITY_KV) return
  const entries = await readAllowlist(env.SECURITY_KV)
  await writeAllowlist(env.SECURITY_KV, entries.filter(item => item.id !== id))
}

export async function recordMaliciousRequest(env: SecurityEnv, request: Request, reason: string) {
  if (!env.SECURITY_KV) return false
  await appendSecurityEvent(env, request, 'request', 'failure', reason)
  const ip = requestIp(request)
  const count = await incrementFailure(env, 'ip', `${ip}:malicious`)
  if (count < 3) return false
  const now = Date.now()
  await putBlock(env, {
    id: crypto.randomUUID(), type: 'ip', value: ip,
    reason: `检测到重复恶意请求：${reason}`,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(), automatic: true,
  })
  return true
}
