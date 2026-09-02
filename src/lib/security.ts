const CLIENT_ID_KEY = 'matrix-nova-security-client-id'

/** A revocable browser-installation identifier, not a hardware fingerprint. */
export function getClientSecurityId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    document.cookie = `matrix-nova-client-id=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`
    return id
  } catch {
    return ''
  }
}
