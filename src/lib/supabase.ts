import { createClient } from '@supabase/supabase-js'

const MAX_CONCURRENT_WRITES = 4
const MAX_QUEUED_WRITES = 32
let activeWrites = 0
const writeQueue: Array<{ input: RequestInfo | URL; init?: RequestInit; resolve: (response: Response) => void; reject: (error: unknown) => void }> = []

function pumpWrites() {
  while (activeWrites < MAX_CONCURRENT_WRITES && writeQueue.length) {
    const next = writeQueue.shift()!
    activeWrites += 1
    fetch(next.input, next.init)
      .then(next.resolve, next.reject)
      .finally(() => { activeWrites -= 1; pumpWrites() })
  }
}

/** Keep every browser session from issuing more than four writes at once. */
function limitedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return fetch(input, init)
  return new Promise<Response>((resolve, reject) => {
    if (writeQueue.length >= MAX_QUEUED_WRITES) { reject(new Error('请求过于频繁，请稍后重试。')); return }
    writeQueue.push({ input, init, resolve, reject })
    pumpWrites()
  })
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { fetch: limitedFetch } },
)

export function readableError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return '操作失败，请稍后重试'
}
