import type { User } from '@supabase/supabase-js'
import { computed, ref } from 'vue'
import type { Profile } from '../lib/types'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const user = ref<User | null>(null)
const profile = ref<Profile | null>(null)
const ready = ref(false)
const blockedMessage = ref('')
let initialized = false
const SESSION_STARTED_KEY = 'hackflow-session-started-at'
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000

function clearSessionMarker() { localStorage.removeItem(SESSION_STARTED_KEY) }
function sessionExpired() {
  const startedAt = Number(localStorage.getItem(SESSION_STARTED_KEY) || 0)
  return Boolean(startedAt && Date.now() - startedAt >= SESSION_MAX_AGE)
}
function markSessionStarted() {
  if (!localStorage.getItem(SESSION_STARTED_KEY)) localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()))
}
async function ensureSessionValid() {
  if (user.value && sessionExpired()) {
    await supabase.auth.signOut()
    clearSessionMarker()
    user.value = null
    profile.value = null
    return false
  }
  return true
}

async function loadProfile() {
  if (!user.value) { profile.value = null; return }
  const { data, error } = await supabase.rpc('get_my_account_state')
  if (error || !data) { profile.value = null; return }
  const state = Array.isArray(data) ? data[0] : data
  profile.value = state as Profile
  if (profile.value?.status === 'banned') {
    blockedMessage.value = '你的账号已被封禁，请联系管理员。'
    await supabase.auth.signOut()
    clearSessionMarker()
    user.value = null
  }
}

function consumeBlockedMessage() {
  const message = blockedMessage.value
  blockedMessage.value = ''
  return message
}

async function initAuth() {
  if (initialized) return
  initialized = true
  if (!isSupabaseConfigured) { ready.value = true; return }
  const { data } = await supabase.auth.getSession()
  user.value = data.session?.user ?? null
  if (user.value && sessionExpired()) {
    await supabase.auth.signOut()
    clearSessionMarker()
    user.value = null
  } else if (user.value) markSessionStarted()
  await loadProfile()
  ready.value = true
  supabase.auth.onAuthStateChange(async (_event, session) => {
    user.value = session?.user ?? null
    if (user.value) { markSessionStarted(); await loadProfile() }
    else { profile.value = null; clearSessionMarker() }
  })
}

export function useAuth() {
  return {
    user,
    profile,
    ready,
    isAdmin: computed(() => profile.value?.role === 'admin' && profile.value.status === 'active'),
    isLoggedIn: computed(() => Boolean(user.value && profile.value?.status === 'active')),
    initAuth,
    ensureSessionValid,
    loadProfile,
    consumeBlockedMessage,
    signOut: async () => { clearSessionMarker(); return supabase.auth.signOut() },
  }
}
