// 公共社区实时状态：多视图共享的消息列表、未读角标与 Realtime 订阅。
// App.vue 登录后启动（保证前台页面也能显示红点），DashboardView 直接消费。
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export interface CommunityPost {
  id: string
  author_id: string
  content: string | null
  created_at: string
  nickname: string
  reply_to?: string | null
  reply_nickname?: string | null
  reply_content?: string | null
  retracted_at?: string | null
  admin_deleted_at?: string | null
}

// 模块级单例状态：App / Dashboard 共用同一份
const posts = ref<CommunityPost[]>([])
const loading = ref(false)
const unreadCount = ref(0)
let channel: ReturnType<typeof supabase.channel> | undefined
let started = false
let currentUserId: string | null = null
let viewing = false
let lastReadAt = 0
let reloadTimer: ReturnType<typeof setTimeout> | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined

function readStorageKey() { return currentUserId ? `hackflow:community-read:${currentUserId}` : '' }

function computeUnread() {
  if (!lastReadAt) { unreadCount.value = 0; return }
  const me = currentUserId
  unreadCount.value = posts.value.filter(post =>
    post.author_id !== me && !post.retracted_at && !post.admin_deleted_at && new Date(post.created_at).getTime() > lastReadAt,
  ).length
}

function markAllRead() {
  const latest = posts.value.length ? new Date(posts.value[posts.value.length - 1].created_at).getTime() : Date.now()
  lastReadAt = Math.max(lastReadAt, latest)
  unreadCount.value = 0
  const key = readStorageKey()
  if (key && typeof window !== 'undefined') localStorage.setItem(key, String(lastReadAt))
}

async function load(silent = false) {
  if (!silent) loading.value = true
  const { data, error } = await supabase.rpc('get_community_posts')
  if (!silent) loading.value = false
  if (error) return
  posts.value = (data || []) as CommunityPost[]
  computeUnread()
  if (viewing) markAllRead()
}

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => { void load(true) }, 350)
}

function setViewing(active: boolean) {
  viewing = active
  if (active && posts.value.length) markAllRead()
}

function start(userId: string) {
  const userChanged = currentUserId !== userId
  currentUserId = userId
  if (userChanged) {
    const key = readStorageKey()
    const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    // 首次进入频道：把历史消息视为已读，避免一上来就是 99+
    lastReadAt = stored ? Number(stored) : Date.now()
    unreadCount.value = 0
    void load()
  }
  if (started) return
  started = true
  channel = supabase.channel('community-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, scheduleReload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_posts' }, scheduleReload)
    .subscribe(status => { if (status === 'SUBSCRIBED') void load(true) })
  // Realtime 万一断连时的兜底轮询（页面隐藏时跳过）
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    void load(true)
  }, 45_000)
}

function stop() {
  started = false
  viewing = false
  if (channel) { void supabase.removeChannel(channel); channel = undefined }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = undefined }
  unreadCount.value = 0
}

export function useCommunity() {
  return { posts, loading, unreadCount, load, markAllRead, setViewing, start, stop }
}
