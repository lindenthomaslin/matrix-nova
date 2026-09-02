/**
 * Only allow URLs that are safe to use as image/background resources.
 * Vue escapes text content, but untrusted URLs still need protocol validation.
 */
export function safeAssetUrl(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const input = value.trim()
  if (!input) return fallback
  if (input.startsWith('/') && !input.startsWith('//')) return input
  try {
    const url = new URL(input, window.location.origin)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return url.href
  } catch {
    // Invalid URLs are ignored and replaced with the known-safe fallback.
  }
  return fallback
}

/** Only allow normal web links for user-provided profile links. */
export function safeHttpUrl(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const input = value.trim()
  if (!input) return fallback
  try {
    const url = new URL(input)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    // Invalid URLs are ignored and replaced with the known-safe fallback.
  }
  return fallback
}
