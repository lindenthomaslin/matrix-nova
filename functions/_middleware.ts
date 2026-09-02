import { activeRequestBlock, recordMaliciousRequest, type SecurityEnv } from './_shared/security'

interface Env extends SecurityEnv {}

const SUSPICIOUS_INPUT = /(?:<\s*script|<\s*iframe|javascript\s*:|on(?:error|load|click)\s*=|union\s+(?:all\s+)?select|(?:or|and)\s+['"`]?\d+['"`]?\s*=\s*['"`]?\d+|pg_sleep\s*\(|sleep\s*\(|benchmark\s*\(|\.\.\/|%2e%2e%2f|\/etc\/passwd|\x00)/i

async function containsSuspiciousInput(request: Request) {
  const url = new URL(request.url)
  if (SUSPICIOUS_INPUT.test(`${url.pathname}${url.search}`)) return 'suspicious URL or query pattern'
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return ''
  const length = Number(request.headers.get('content-length') || 0)
  if (!length || length > 128 * 1024) return ''
  const body = await request.clone().text()
  return SUSPICIOUS_INPUT.test(body) ? 'suspicious form payload pattern' : ''
}

export const onRequest = async ({ request, env, next }: { request: Request; env: Env; next: () => Promise<Response> }) => {
  const block = await activeRequestBlock(env, request)
  if (block) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(block.expiresAt) - Date.now()) / 1000))
    return new Response('Access temporarily restricted.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } })
  }
  const suspiciousReason = await containsSuspiciousInput(request)
  if (suspiciousReason) {
    const blocked = await recordMaliciousRequest(env, request, suspiciousReason)
    if (blocked) return new Response('Access temporarily restricted.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  const response = await next()
  const pathname = new URL(request.url).pathname
  if (pathname === '/developer' || pathname.startsWith('/developer/')) {
    const headers = new Headers(response.headers)
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  return response
}
