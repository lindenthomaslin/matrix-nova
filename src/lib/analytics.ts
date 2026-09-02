import { supabase } from './supabase'

const VISITOR_KEY = 'matrix-nova-visitor-id'

function visitorId() {
  let id = localStorage.getItem(VISITOR_KEY)
  if (!id) {
    id = crypto.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(VISITOR_KEY, id)
  }
  return id
}

/** Records aggregate site usage without storing IPs or browser fingerprints. */
export async function trackPageView(fullPath: string, userId?: string) {
  const path = fullPath.split('?')[0].slice(0, 180) || '/'
  await supabase.from('site_visit_events').insert({ visitor_id: visitorId(), user_id: userId || null, path })
}
