<script setup lang="ts">
import { Archive, Ban, BarChart3, Check, ChevronRight, CircleUserRound, ClipboardCheck, Download, Eye, FileText, Home, Image, LayoutGrid, LogOut, Mail, Menu, Palette, Pencil, Pin, Plus, Power, QrCode, RefreshCw, Save, Search, Settings2, ShieldCheck, Trash2, Upload, UserCog, Users, X, Zap } from '@lucide/vue'
import QrScanner from 'qr-scanner'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { readableError, supabase } from '../lib/supabase'
import { useBranding } from '../lib/branding'
import { safeAssetUrl, safeHttpUrl } from '../lib/safeUrl'
import type { Profile, Registration, RegistrationStatus, SiteAnnouncement, SystemConfig } from '../lib/types'

type Tab = 'overview' | 'registrations' | 'reviews' | 'checkin' | 'teams' | 'users' | 'security' | 'announcements' | 'config'
type CheckinSession = { id: string; name: string; created_at: string; created_by: string | null }
type Analytics = { visitors_today: number; page_views_today: number; online_visitors: number; registered_users: number; registrations_total: number; registrations_pending: number; generated_at?: string; trend: Array<{ date: string; visitors: number; views: number }>; top_pages: Array<{ path: string; views: number }> }
type SecurityEvent = { id: string; action: 'login' | 'signup' | 'recover'; path: string; ip: string; machine: string | null; outcome: 'attempt' | 'success' | 'failure' | 'blocked'; reason?: string; createdAt: string }
type SecurityBlock = { id: string; type: 'ip' | 'machine'; value: string; reason: string; createdAt: string; expiresAt: string; automatic?: boolean }
type SecurityAllowlist = { id: string; type: 'ip' | 'machine'; value: string; label: string; createdAt: string }
type SecurityMachine = { value: string; requests: number; failures: number; lastSeen: string; allowlisted: boolean }
type SecurityData = { todayRequests: number; uniqueIps7d: number; requests30m: number; activeAttacks: number; blockedIps: number; knownMachines: number; trend: Array<{ date: string; requests: number; attacks: number }>; riskSources: Array<{ ip: string; requests: number; failures: number; lastSeen: string; blocked: boolean }>; machineIds: SecurityMachine[]; events: SecurityEvent[]; blocks: SecurityBlock[]; allowlist: SecurityAllowlist[] }
const router = useRouter()
const auth = useAuth()
const { siteName, siteSubtitle, loadBranding } = useBranding()
const activeTab = ref<Tab>('overview')
const sidebarOpen = ref(false)
const scannerVideo = ref<HTMLVideoElement | null>(null)
const scanner = ref<QrScanner | null>(null)
const scannerActive = ref(false)
const scannerMessage = ref('')
const checkinProcessing = ref(false)
const manualCheckInToken = ref('')
const checkinSessionName = ref(`Matrix Nova ${new Date().toLocaleDateString('zh-CN')} 现场签到`)
const selectedCheckinSessionId = ref('')
const loading = ref(false)
const toast = ref('')
const errorMessage = ref('')
const registrations = ref<Registration[]>([])
const profiles = ref<Profile[]>([])
const teams = ref<Array<{ id: string; name: string; invite_code: string; created_at: string; members: Array<{ user_id: string; role: string; nickname: string; email: string }> }>>([])
const checkinSessions = ref<CheckinSession[]>([])
const analytics = ref<Analytics>({ visitors_today: 0, page_views_today: 0, online_visitors: 0, registered_users: 0, registrations_total: 0, registrations_pending: 0, trend: [], top_pages: [] })
const analyticsLoading = ref(false)
const securityLoading = ref(false)
const securityActionLoading = ref(false)
const security = ref<SecurityData>({ todayRequests: 0, uniqueIps7d: 0, requests30m: 0, activeAttacks: 0, blockedIps: 0, knownMachines: 0, trend: [], riskSources: [], machineIds: [], events: [], blocks: [], allowlist: [] })
const securityForm = reactive<{ type: 'ip' | 'machine'; value: string; reason: string; durationMinutes: number }>({ type: 'ip', value: '', reason: '', durationMinutes: 60 })
const allowForm = reactive<{ type: 'ip' | 'machine'; value: string; label: string }>({ type: 'ip', value: '', label: '' })
let analyticsChannel: ReturnType<typeof supabase.channel> | undefined
let refreshTimer: ReturnType<typeof setInterval> | undefined
let securityRealtimeTimer: ReturnType<typeof setInterval> | undefined
const search = ref('')
const reviewSearch = ref('')
const reviewFilter = ref<'all' | 'pending' | 'reviewed'>('pending')
const statusFilter = ref<'all' | RegistrationStatus>('all')
const regEditor = ref<Registration | null>(null)
const userEditor = ref<Partial<Profile> & { password?: string } | null>(null)
const isNewUser = ref(false)
const configSection = ref<'frontend' | 'team' | 'registration' | 'rules' | 'email' | 'smtp'>('frontend')
let teamMemberKeySeq = 0
const teamMembers = ref<Array<{ id?: string; _key: number; name: string; role: string; bio: string; image_url: string; website_url: string; github_url: string; sort_order: number }>>([])
const archiveLabel = ref('')
const announcements = ref<SiteAnnouncement[]>([])
const announcementDraft = reactive({ title: '', content: '' })
const announcementSaving = ref(false)
const config = reactive<SystemConfig>({ auth_hero_image_url: '', registration_open: true, dashboard_announcement: '欢迎来到 Matrix Nova 控制台。请留意报名审核状态与赛事通知。', site_name: 'Matrix Nova', site_subtitle: '创新者黑客松', site_icon_url: '', footer_content: '© 2026 Matrix Nova. Build what matters.', home_hero_image_url: '', home_eyebrow: '2026 创新者黑客松', home_title: '把未完成的想法，', home_highlight: '做成真实的未来。', home_subtitle: '48 小时，跨越技术与创意。和优秀的伙伴一起，为真实世界创造值得被看见的产品。', home_cta_label: '开始报名', home_event_date: '10.16 — 10.18', home_location: '上海 · 西岸', home_capacity: '300 位创造者', home_about_label: '从灵感到产品', home_about_title: '一个周末，把', home_about_highlight: '可能性变成现场。', home_about_description: '没有预设答案，只有一群愿意从问题出发、快速协作、把想法做成真实原型的人。', home_feature_1_title: '48 小时极限共创', home_feature_1_text: '从灵感、组队到可运行原型，让每一次判断在真实反馈里发生。', home_feature_2_title: '开放命题，不限边界', home_feature_2_text: 'AI、创意工具、未来生产力与可持续科技，都可以成为你的起点。', home_feature_3_title: '让作品被看见', home_feature_3_text: '和伙伴、导师及评委面对面，用产品讲出你的下一种可能。', smtp_host: '', smtp_port: 587, from_email: '', smtp_username: '', smtp_password: '', notification_template: '你好 {{nickname}}，\n\n你的 Matrix Nova 2026 报名状态已更新为：{{status}}。\n\nMatrix Nova 赛事团队', verification_email_template: '你的 Matrix Nova 验证码是：{{code}}\n\n验证码 10 分钟内有效，请勿转发给他人。', rules_content: '请遵守赛事规则，提交真实、准确的报名信息，并尊重其他参赛者。', privacy_content: '我们仅会使用报名信息进行资格审核、赛事联络与活动组织，不会将其用于无关用途。' })
const configSaveState = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
let configSaveTimer: ReturnType<typeof setTimeout> | undefined
let configSavePromise: Promise<boolean> | null = null
let configHydrated = false
let savedVerificationTemplate = ''
const teamSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const dirtyTeamMemberKeys = new Set<number>()
let teamMembersHydrated = false

const nav = [
  { id: 'overview' as Tab, label: '控制面板', icon: LayoutGrid },
  { id: 'registrations' as Tab, label: '报名管理', icon: FileText },
  { id: 'checkin' as Tab, label: '扫码签到', icon: QrCode },
  { id: 'teams' as Tab, label: '队伍管理', icon: Users },
  { id: 'users' as Tab, label: '用户管理', icon: Users },
  { id: 'announcements' as Tab, label: '公告管理', icon: Mail },
  { id: 'security' as Tab, label: '安全中心', icon: ShieldCheck },
  { id: 'config' as Tab, label: '系统配置', icon: Settings2 },
]
const filteredRegistrations = computed(() => registrations.value.filter(item => {
  const q = search.value.toLowerCase()
  const matchSearch = !q || [item.full_name, item.team_name, item.profiles?.email, item.track].some(v => v?.toLowerCase().includes(q))
  return matchSearch && (statusFilter.value === 'all' || item.status === statusFilter.value)
}))
const stats = computed(() => ({ total: registrations.value.length, pending: registrations.value.filter(v => v.status === 'pending').length, accepted: registrations.value.filter(v => v.status === 'accepted').length, rejected: registrations.value.filter(v => v.status === 'rejected').length }))
const trendMax = computed(() => Math.max(1, ...analytics.value.trend.map(item => Math.max(item.visitors, item.views))))
const visitorChartPoints = computed(() => analytics.value.trend.map((item, index) => `${analytics.value.trend.length < 2 ? 50 : index / (analytics.value.trend.length - 1) * 100},${90 - item.visitors / trendMax.value * 76}`).join(' '))
const viewChartPoints = computed(() => analytics.value.trend.map((item, index) => `${analytics.value.trend.length < 2 ? 50 : index / (analytics.value.trend.length - 1) * 100},${90 - item.views / trendMax.value * 76}`).join(' '))
const selectedCheckinSession = computed(() => checkinSessions.value.find(item => item.id === selectedCheckinSessionId.value) || null)
function sessionRoster(sessionId: string) { return registrations.value.filter(item => item.checkin_session_id === sessionId && item.status === 'accepted') }
function sessionRosterStats(sessionId: string) { const roster = sessionRoster(sessionId); return { total: roster.length, checkedIn: roster.filter(item => item.checked_in_at).length } }
const selectedSessionRoster = computed(() => selectedCheckinSessionId.value ? sessionRoster(selectedCheckinSessionId.value) : [])
const selectedSessionCheckedIn = computed(() => selectedSessionRoster.value.filter(item => item.checked_in_at))
const selectedSessionPending = computed(() => selectedSessionRoster.value.filter(item => !item.checked_in_at))
const checkinRosterFilter = ref<'all' | 'checked-in' | 'pending'>('all')
const visibleSessionRoster = computed(() => checkinRosterFilter.value === 'checked-in' ? selectedSessionCheckedIn.value : checkinRosterFilter.value === 'pending' ? selectedSessionPending.value : selectedSessionRoster.value)
const filteredReviewRegistrations = computed(() => {
  const q = reviewSearch.value.trim().toLowerCase()
  return registrations.value.filter(item => {
    const matchStatus = reviewFilter.value === 'all' || (reviewFilter.value === 'pending' ? item.status === 'pending' : item.status !== 'pending')
    const matchSearch = !q || [item.full_name, item.applicant_email, item.profiles?.email, item.team_name, item.track, item.organization].some(value => value?.toLowerCase().includes(q))
    return matchStatus && matchSearch
  })
})

function notify(message: string) { toast.value = message; setTimeout(() => toast.value = '', 2600) }
function extractCheckInToken(value: string) { const raw = value.trim(); return raw.startsWith('HACKFLOW-CHECKIN:') ? raw.slice('HACKFLOW-CHECKIN:'.length) : raw }
async function processCheckIn(value: string) {
  if (checkinProcessing.value) return
  const token = extractCheckInToken(value)
  if (!token) { scannerMessage.value = '请提供有效的签到二维码或签到码。'; return }
  if (!selectedCheckinSessionId.value) { scannerMessage.value = '请先在下方列表中选择一个签到场次。'; return }
  checkinProcessing.value = true
  const { data, error } = await supabase.rpc('admin_check_in_participant', { p_checkin_token: token, p_session_id: selectedCheckinSessionId.value })
  checkinProcessing.value = false
  if (error) { scannerMessage.value = readableError(error); return }
  const result = data as { ok?: boolean; code?: string; message?: string; checked_in_at?: string } | null
  scannerMessage.value = result?.message || '签到结果未知，请刷新名单后重试。'
  if (result?.code === 'already_checked_in' && result.checked_in_at) scannerMessage.value = `${result.message} 时间：${new Date(result.checked_in_at).toLocaleString('zh-CN')}`
  if (result?.ok) { manualCheckInToken.value = ''; await loadAll() }
}
async function startScanner() {
  scannerMessage.value = ''
  if (!scannerVideo.value) return
  try {
    if (!scanner.value) scanner.value = new QrScanner(scannerVideo.value, result => { void processCheckIn(result.data).then(() => { if (scannerMessage.value.includes('成功') || scannerMessage.value.includes('已完成')) stopScanner() }) }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true })
    await scanner.value.start(); scannerActive.value = true
  } catch (error) { scannerMessage.value = `无法打开摄像头：${readableError(error)}。请确认浏览器已允许相机权限，或使用右侧手动签到。` }
}
function stopScanner() { scanner.value?.stop(); scannerActive.value = false }
function submitManualCheckIn() { void processCheckIn(manualCheckInToken.value) }
async function deleteCheckinSession(session: CheckinSession) {
  if (!window.confirm(`确定删除“${session.name}”吗？删除场次不会删除报名用户和历史签到数据。`)) return
  loading.value = true
  const { error } = await supabase.from('checkin_sessions').delete().eq('id', session.id)
  loading.value = false
  if (error) { errorMessage.value = readableError(error); return }
  checkinSessions.value = checkinSessions.value.filter(item => item.id !== session.id)
  if (selectedCheckinSessionId.value === session.id) { selectedCheckinSessionId.value = ''; stopScanner() }
  notify('签到场次已删除')
}
async function deleteTeam(team: { id: string; name: string }) {
  if (!window.confirm(`确定解散队伍“${team.name}”吗？成员将恢复为未组队状态。`)) return
  const { error } = await supabase.rpc('admin_delete_team', { p_team_id: team.id })
  if (error) { errorMessage.value = readableError(error); return }
  teams.value = teams.value.filter(item => item.id !== team.id); notify('队伍已解散')
}
function editRegistration(item: Registration) { regEditor.value = JSON.parse(JSON.stringify(item)) }
function switchTab(tab: Tab) {
  activeTab.value = tab; sidebarOpen.value = false; search.value = ''; reviewSearch.value = ''; errorMessage.value = ''
  if (securityRealtimeTimer) { clearInterval(securityRealtimeTimer); securityRealtimeTimer = undefined }
  if (tab === 'security') {
    void loadSecurity()
    securityRealtimeTimer = setInterval(() => { void loadSecurity() }, 3000)
  }
}
async function loadAll() {
  loading.value = true
  const [regResult, profileResult, configResult, sessionResult, teamsResult, siteTeamResult, announcementResult] = await Promise.all([
    supabase.from('hackathon_register').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('system_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('checkin_sessions').select('*').order('created_at', { ascending: false }),
    supabase.rpc('admin_list_teams'),
    supabase.from('site_team_members').select('*').order('sort_order'),
    supabase.from('site_announcements').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
  ])
  if (regResult.error || profileResult.error || configResult.error || sessionResult.error || teamsResult.error || announcementResult.error) errorMessage.value = readableError(regResult.error || profileResult.error || configResult.error || sessionResult.error || teamsResult.error || announcementResult.error)
  const profileMap = new Map((profileResult.data || []).map(profile => [profile.id, profile]))
  registrations.value = ((regResult.data || []) as Registration[]).map(item => ({ ...item, profiles: profileMap.get(item.user_id) ? { email: profileMap.get(item.user_id)!.email, nickname: profileMap.get(item.user_id)!.nickname } : undefined }))
  profiles.value = (profileResult.data || []) as Profile[]
  checkinSessions.value = (sessionResult.data || []) as CheckinSession[]
  teams.value = (teamsResult.data || []) as typeof teams.value
  announcements.value = (announcementResult.data || []) as SiteAnnouncement[]
  const currentMembers = teamMembers.value
  const currentById = new Map(currentMembers.filter(member => member.id).map(member => [member.id, member]))
  const remoteMembers = ((siteTeamResult.data || []) as Array<Omit<typeof teamMembers.value[number], '_key'>>).map(m => {
    const existing = m.id ? currentById.get(m.id) : undefined
    return existing && dirtyTeamMemberKeys.has(existing._key) ? existing : { ...m, website_url: m.website_url || '', github_url: m.github_url || '', image_url: m.image_url || '', _key: existing?._key || ++teamMemberKeySeq }
  })
  const remoteIds = new Set(remoteMembers.map(member => member.id).filter(Boolean))
  const localOnlyMembers = currentMembers.filter(member => !member.id || (dirtyTeamMemberKeys.has(member._key) && !remoteIds.has(member.id)))
  teamMembers.value = [...remoteMembers, ...localOnlyMembers]
  if (!siteTeamResult.error) teamMembersHydrated = true
  if (configResult.data) {
    Object.assign(config, configResult.data)
    savedVerificationTemplate = config.verification_email_template || ''
  }
  if (!configResult.error) configHydrated = true
  loading.value = false
}
async function loadAnalytics() {
  analyticsLoading.value = true
  const { data, error } = await supabase.rpc('get_admin_analytics')
  analyticsLoading.value = false
  if (error) { errorMessage.value = readableError(error); return }
  if (data) analytics.value = data as Analytics
}
async function loadSecurity() {
  if (securityLoading.value) return
  securityLoading.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) throw new Error('登录已失效，请重新登录。')
    const response = await fetch('/api/security', { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } })
    const data = await response.json().catch(() => ({})) as { error?: string } & Partial<SecurityData>
    if (!response.ok) throw new Error(data.error || '安全数据加载失败')
    security.value = data as SecurityData
  } catch (error) { errorMessage.value = readableError(error) }
  finally { securityLoading.value = false }
}
async function securityAction(payload: object) {
  securityActionLoading.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) throw new Error('登录已失效，请重新登录。')
    const response = await fetch('/api/security', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` }, body: JSON.stringify(payload) })
    const data = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) throw new Error(data.error || '安全策略操作失败')
    await loadSecurity()
    const action = 'action' in payload ? payload.action : ''
    notify(action === 'unblock' ? '限制已解除' : action === 'allow' ? '已加入免封名单' : action === 'remove_allow' ? '已移出免封名单' : '安全限制已生效')
  } catch (error) { errorMessage.value = readableError(error) }
  finally { securityActionLoading.value = false }
}
async function createSecurityBlock() {
  if (!securityForm.value.trim()) { errorMessage.value = '请输入 IP 地址或设备标识。'; return }
  await securityAction({ action: 'block', type: securityForm.type, value: securityForm.value, reason: securityForm.reason, durationMinutes: securityForm.durationMinutes })
  securityForm.value = ''; securityForm.reason = ''
}
function unblockSecurity(block: SecurityBlock) {
  if (window.confirm(`确定解除对 ${block.type === 'ip' ? 'IP' : '设备'} ${block.type === 'machine' ? block.value.slice(0, 12) + '…' : block.value} 的限制吗？`)) void securityAction({ action: 'unblock', id: block.id })
}
function blockRiskSource(source: { ip: string; failures: number }) {
  if (window.confirm(`确定立即封禁高风险 IP ${source.ip} 吗？该 IP 将无法继续调用登录、注册和密码重置接口。`)) {
    void securityAction({ action: 'block', type: 'ip', value: source.ip, reason: `高风险来源：近 7 天失败 ${source.failures} 次`, durationMinutes: 60 })
  }
}
function allowSecurity(type: 'ip' | 'machine', value: string, label = '') {
  if (!value) return
  void securityAction({ action: 'allow', type, value, label })
}
function removeSecurityAllow(entry: SecurityAllowlist) {
  if (window.confirm(`确定移除“${entry.label}”的免封资格吗？`)) void securityAction({ action: 'remove_allow', id: entry.id })
}
async function addAllowEntry() {
  if (!allowForm.value.trim()) { errorMessage.value = '请输入要免封的 IP 或设备标识。'; return }
  await securityAction({ action: 'allow', type: allowForm.type, value: allowForm.value, label: allowForm.label })
  allowForm.value = ''; allowForm.label = ''
}
function securityOutcomeLabel(outcome: SecurityEvent['outcome']) {
  return outcome === 'success' ? '成功' : outcome === 'failure' ? '失败' : outcome === 'blocked' ? '已拦截' : '请求'
}
function securityOutcomeClass(outcome: SecurityEvent['outcome']) {
  return outcome === 'success' ? 'success' : outcome === 'failure' ? 'danger' : outcome === 'blocked' ? 'blocked' : 'neutral'
}
async function sendStatusNotification(item: Registration, status: RegistrationStatus, rejectionReason?: string | null) {
  const { data, error } = await supabase.functions.invoke('send-notification', { body: { registration_id: item.id, status, rejection_reason: rejectionReason || null } })
  if (error) {
    const response = (error as { context?: Response }).context
    const detail = response ? await response.clone().json().catch(() => null) : null
    throw new Error(detail?.error || detail?.message || error.message)
  }
  if (data?.error) throw new Error(data.error)
}
async function updateStatus(item: Registration, status: RegistrationStatus, event?: Event) {
  const previousStatus = item.status
  let rejectionReason = item.rejection_reason || ''
  if (status === 'rejected') {
    const entered = window.prompt('请输入拒绝理由（必填）', rejectionReason)
    if (entered === null) { if (event?.target) (event.target as HTMLSelectElement).value = previousStatus; return }
    rejectionReason = entered.trim()
    if (!rejectionReason) { if (event?.target) (event.target as HTMLSelectElement).value = previousStatus; errorMessage.value = '拒绝报名必须填写拒绝理由。'; return }
  } else rejectionReason = ''
  const { error } = await supabase.from('hackathon_register').update({ status, rejection_reason: rejectionReason || null }).eq('id', item.id)
  if (error) { if (event?.target) (event.target as HTMLSelectElement).value = previousStatus; errorMessage.value = readableError(error); return }
  item.status = status; item.rejection_reason = rejectionReason || null
  if (status === 'accepted' || status === 'rejected') {
    try { await sendStatusNotification(item, status, rejectionReason); notify(status === 'accepted' ? '报名已通过，通知邮件已发送' : '报名已拒绝，通知邮件已发送') }
    catch (error) { errorMessage.value = `状态已更新，但通知邮件发送失败：${readableError(error)}` }
  } else notify('报名状态已更新')
}
async function saveRegistration() {
  if (!regEditor.value) return
  const original = registrations.value.find(v => v.id === regEditor.value?.id)
  if (regEditor.value.status === 'rejected' && !regEditor.value.rejection_reason?.trim()) { errorMessage.value = '拒绝报名必须填写拒绝理由。'; return }
  const { id, profiles: _profiles, created_at: _created, updated_at: _updated, ...changes } = regEditor.value
  const { data, error } = await supabase.from('hackathon_register').update(changes).eq('id', id).select('*').single()
  if (error) errorMessage.value = readableError(error); else {
    const linkedProfile = profiles.value.find(profile => profile.id === (data as Registration).user_id)
    const updated = { ...(data as Registration), profiles: linkedProfile ? { email: linkedProfile.email, nickname: linkedProfile.nickname } : undefined }
    registrations.value.splice(registrations.value.findIndex(v => v.id === id), 1, updated)
    regEditor.value = null
    if (original && original.status !== updated.status && (updated.status === 'accepted' || updated.status === 'rejected')) {
      try { await sendStatusNotification(updated, updated.status, updated.rejection_reason); notify(updated.status === 'accepted' ? '报名已通过，通知邮件已发送' : '报名已拒绝，通知邮件已发送') }
      catch (notifyError) { errorMessage.value = `资料已保存，但通知邮件发送失败：${readableError(notifyError)}` }
    } else notify('报名资料已保存')
  }
}
async function deleteRegistration(item: Registration) {
  if (!confirm(`确定删除 ${item.full_name} 的报名记录吗？此操作无法撤销。`)) return
  const { error } = await supabase.from('hackathon_register').delete().eq('id', item.id)
  if (error) errorMessage.value = readableError(error); else { registrations.value = registrations.value.filter(v => v.id !== item.id); notify('报名记录已删除') }
}
function exportCsv() {
  const rows = [['姓名','邮箱','昵称','团队','方向','技能','状态','报名时间'], ...filteredRegistrations.value.map(v => [v.full_name,v.profiles?.email || '',v.profiles?.nickname || '',v.team_name,v.track,v.skills?.join(' / '),v.status,new Date(v.created_at).toLocaleString('zh-CN')])]
  const csv = '\ufeff' + rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"','""')}"`).join(',')).join('\n')
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `hackflow-registrations-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href)
}
function openNewUser() { isNewUser.value = true; userEditor.value = { email: '', nickname: '', password: '', role: 'user', status: 'active' } }
function openEditUser(item: Profile) {
  if (item.is_owner && !auth.profile.value?.is_owner) { errorMessage.value = '站点所有者账号受永久保护，无法由其他管理员编辑。'; return }
  isNewUser.value = false; userEditor.value = { ...item }
}
async function invokeUserAdmin(action: string, payload: object) {
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) throw new Error('登录已失效，请重新登录后再操作。')
  const { data, error } = await supabase.functions.invoke('admin-users', { body: { action, ...payload } })
  if (error) {
    const response = (error as { context?: Response }).context
    const detail = response ? await response.clone().json().catch(() => null) : null
    throw new Error(detail?.error || detail?.message || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
async function saveUser() {
  if (!userEditor.value) return
  try {
    if (isNewUser.value) await invokeUserAdmin('create', { user: userEditor.value })
    else await invokeUserAdmin('update', { user: userEditor.value })
    userEditor.value = null; await loadAll(); notify(isNewUser.value ? '用户已创建' : '用户资料已更新')
  } catch (error) { errorMessage.value = readableError(error) }
}
async function loadAnnouncements() {
  const { data, error } = await supabase.from('site_announcements').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false })
  if (error) { errorMessage.value = readableError(error); return }
  announcements.value = (data || []) as SiteAnnouncement[]
}
async function createAnnouncement() {
  const title = announcementDraft.title.trim() || '最新公告'
  const content = announcementDraft.content.trim()
  if (!content) { errorMessage.value = '请填写公告内容。'; return }
  announcementSaving.value = true; errorMessage.value = ''
  const { error } = await supabase.from('site_announcements').insert({ title, content, created_by: auth.user.value?.id || null })
  announcementSaving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  announcementDraft.title = ''; announcementDraft.content = ''
  await loadAnnouncements()
  notify('公告已发布，并同步到用户控制台')
}
async function pinAnnouncement(item: SiteAnnouncement) {
  if (item.is_pinned) return
  announcementSaving.value = true; errorMessage.value = ''
  const { error } = await supabase.rpc('admin_pin_announcement', { p_announcement_id: item.id })
  announcementSaving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  await loadAnnouncements()
  notify('公告已置顶')
}
async function deleteAnnouncement(item: SiteAnnouncement) {
  if (!window.confirm(`确定删除公告“${item.title}”吗？`)) return
  announcementSaving.value = true; errorMessage.value = ''
  const { error } = await supabase.from('site_announcements').delete().eq('id', item.id)
  announcementSaving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  await loadAnnouncements()
  notify('公告已删除')
}
async function toggleBan(item: Profile) {
  if (item.is_owner && !auth.profile.value?.is_owner) { errorMessage.value = '站点所有者账号不可封禁。'; return }
  try { await invokeUserAdmin('update', { user: { id: item.id, status: item.status === 'active' ? 'banned' : 'active' } }); item.status = item.status === 'active' ? 'banned' : 'active'; notify(item.status === 'banned' ? '用户已封禁' : '账号已解封') }
  catch (error) { errorMessage.value = readableError(error) }
}
async function deleteUser(item: Profile) {
  if (item.is_owner) { errorMessage.value = '站点所有者账号不可删除。'; return }
  if (!confirm(`确定删除账号 ${item.email} 吗？其报名信息也会一并删除。`)) return
  try { await invokeUserAdmin('delete', { user: { id: item.id } }); profiles.value = profiles.value.filter(v => v.id !== item.id); registrations.value = registrations.value.filter(v => v.user_id !== item.id); notify('用户已删除') }
  catch (error) { errorMessage.value = readableError(error) }
}
async function persistConfig(showNotice = false): Promise<boolean> {
  if (configSavePromise) {
    try { await configSavePromise } catch { /* The previous save already reported its error. */ }
  }
  const payload = { ...config, id: 1 }
  const templateChanged = config.verification_email_template !== savedVerificationTemplate
  configSaveState.value = 'saving'
  const request = (async () => {
    const { error } = await supabase.from('system_config').upsert(payload)
    if (error) throw error
    if (templateChanged) {
      const { data, error: templateError } = await supabase.functions.invoke('update-auth-email-template', { body: { template: config.verification_email_template } })
      if (templateError) throw templateError
      if (data?.error) throw new Error(data.error)
      savedVerificationTemplate = config.verification_email_template || ''
    }
    configSaveState.value = 'saved'
    if (showNotice) notify('系统配置与认证邮件模板已保存')
    return true
  })()
  configSavePromise = request
  try {
    return await request
  } catch (error) {
    configSaveState.value = 'error'
    errorMessage.value = readableError(error)
    return false
  } finally {
    if (configSavePromise === request) configSavePromise = null
  }
}
async function saveConfig(showNotice = true) {
  if (configSaveTimer) clearTimeout(configSaveTimer)
  await persistConfig(showNotice)
}
watch(config, () => {
  if (!configHydrated) return
  configSaveState.value = 'pending'
  if (configSaveTimer) clearTimeout(configSaveTimer)
  configSaveTimer = setTimeout(() => { void persistConfig() }, 700)
}, { deep: true })
function flushPendingConfigSave() {
  if (configSaveTimer) {
    clearTimeout(configSaveTimer)
    configSaveTimer = undefined
  }
  if (configHydrated && configSaveState.value === 'pending') void persistConfig()
}
async function uploadSiteImage(field: 'site_icon_url' | 'home_hero_image_url' | 'auth_hero_image_url', event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { errorMessage.value = '请选择不超过 5MB 的 PNG、JPG、WebP、GIF 或 SVG 图片。'; input.value = ''; return }
  loading.value = true; errorMessage.value = ''
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${field}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const { error } = await supabase.storage.from('site-assets').upload(path, file, { contentType: file.type, upsert: false })
  loading.value = false; input.value = ''
  if (error) { errorMessage.value = readableError(error); return }
  config[field] = supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl
  notify('图片已上传，系统会自动保存配置。')
}
function addTeamMember() { teamMembers.value.push({ _key: ++teamMemberKeySeq, name: '', role: '', bio: '', image_url: '', website_url: '', github_url: '', sort_order: teamMembers.value.length }) }
async function uploadTeamMemberImage(member: { id?: string; _key: number; name: string; role: string; bio: string; image_url: string; website_url: string; github_url: string; sort_order: number }, event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { errorMessage.value = '请选择不超过 5MB 的图片。'; return }
  loading.value = true
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `team-members/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const { error } = await supabase.storage.from('site-assets').upload(path, file, { contentType: file.type })
  loading.value = false; input.value = ''
  if (error) { errorMessage.value = readableError(error); return }
  member.image_url = supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl
  if (member.name.trim() && member.role.trim()) await saveTeamMember(member)
  else notify('照片已上传。请补全姓名和职务后保存成员。')
}
function scheduleTeamMemberSave(member: { id?: string; _key: number; name: string; role: string; bio: string; image_url: string; website_url: string; github_url: string; sort_order: number }) {
  if (!teamMembersHydrated) return
  const key = member.id || `new-${member._key}`
  dirtyTeamMemberKeys.add(member._key)
  const previousTimer = teamSaveTimers.get(key)
  if (previousTimer) clearTimeout(previousTimer)
  if (!member.name.trim() || !member.role.trim()) return
  const timer = setTimeout(() => {
    teamSaveTimers.delete(key)
    void saveTeamMember(member, false)
  }, 700)
  teamSaveTimers.set(key, timer)
}
async function saveTeamMember(member: { id?: string; _key: number; name: string; role: string; bio: string; image_url: string; website_url: string; github_url: string; sort_order: number }, showNotice = true) {
  if (!member.name.trim() || !member.role.trim()) { errorMessage.value = '请填写成员姓名和职务。'; return }
  const website_url = member.website_url.trim()
  const github_url = member.github_url.trim()
  if ((website_url && !safeHttpUrl(website_url)) || (github_url && !safeHttpUrl(github_url))) { errorMessage.value = '官网和 GitHub 链接必须以 http:// 或 https:// 开头。'; return }
  const { id, name, role, bio, image_url, sort_order } = member
  const { data, error } = await supabase.from('site_team_members').upsert({ id, name, role, bio, image_url: image_url || null, website_url: website_url || null, github_url: github_url || null, sort_order }).select().single()
  if (error) { errorMessage.value = readableError(error); return }
  if (data?.id && !member.id) member.id = data.id
  dirtyTeamMemberKeys.delete(member._key)
  if (showNotice) notify('成员资料已保存')
}
async function deleteSiteTeamMember(member: { id?: string; name: string }) { if (!member.id || !confirm(`删除 ${member.name} 吗？`)) return; const { error } = await supabase.from('site_team_members').delete().eq('id', member.id); if (error) errorMessage.value = readableError(error); else teamMembers.value = teamMembers.value.filter(item => item.id !== member.id) }
async function clearRegistrationsWithArchive() {
  if (!registrations.value.length) { notify('当前没有可归档的报名数据。'); return }
  const confirmation = window.prompt(`将归档并清空当前 ${registrations.value.length} 条报名记录。请输入“ARCHIVE”确认操作。`)
  if (confirmation !== 'ARCHIVE') return
  loading.value = true
  const { data, error } = await supabase.rpc('archive_and_clear_registrations', { p_archive_label: archiveLabel.value.trim() || `HackFlow ${new Date().toLocaleDateString('zh-CN')} 报名归档` })
  loading.value = false
  if (error) { errorMessage.value = readableError(error); return }
  archiveLabel.value = ''
  await loadAll()
  notify(`已归档并清空 ${data || 0} 条报名记录。`)
}
async function prepareCheckinRoster() {
  const name = checkinSessionName.value.trim()
  if (!name) { errorMessage.value = '请先填写签到场次名称。'; return }
  loading.value = true
  const { data, error } = await supabase.rpc('prepare_checkin_roster', { p_session_name: name })
  loading.value = false
  if (error) { errorMessage.value = readableError(error); return }
  await loadAll()
  selectedCheckinSessionId.value = data?.session_id || ''
  switchTab('checkin')
  scannerMessage.value = `“${name}”已创建，并已导入 ${data?.roster_count || 0} 名已通过审核的选手，可开始扫码签到。`
  notify('签到名单已准备完成')
}
async function testEmail() {
  if (!config.from_email || !config.smtp_host || !config.smtp_username || !config.smtp_password) { errorMessage.value = '请先完整填写 SMTP 服务器、发件邮箱、账号和授权码。'; return }
  const recipient = window.prompt('请输入测试邮件收件地址', config.from_email)
  if (!recipient) return
  loading.value = true; errorMessage.value = ''
  try {
    const { data, error } = await supabase.functions.invoke('test-email', { body: { recipient } })
    if (error) throw error
    if (data?.message) throw new Error(data.message)
    notify('测试邮件已发送')
  } catch (error) { errorMessage.value = readableError(error) }
  finally { loading.value = false }
}
async function logout() { await auth.signOut(); router.push('/') }
onMounted(async () => {
  await loadBranding()
  await Promise.all([loadAll(), loadAnalytics(), loadSecurity()])
  window.addEventListener('pagehide', flushPendingConfigSave)
  analyticsChannel = supabase.channel('admin-live-analytics').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'site_visit_events' }, () => { void loadAnalytics() }).subscribe()
  refreshTimer = setInterval(() => { if (!loading.value) { void loadAll(); void loadAnalytics(); void loadSecurity() } }, 15000)
})
onBeforeUnmount(() => {
  scanner.value?.destroy()
  if (refreshTimer) clearInterval(refreshTimer)
  if (analyticsChannel) void supabase.removeChannel(analyticsChannel)
  if (securityRealtimeTimer) clearInterval(securityRealtimeTimer)
  window.removeEventListener('pagehide', flushPendingConfigSave)
  flushPendingConfigSave()
  for (const timer of teamSaveTimers.values()) clearTimeout(timer)
  teamSaveTimers.clear()
})
</script>

<template>
  <main class="event-admin min-h-screen p-3 sm:p-4">
    <div class="event-admin-shell mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden sm:min-h-[calc(100vh-2rem)]">
      <div v-if="sidebarOpen" class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" @click="sidebarOpen = false" />
      <aside :class="['fixed inset-y-3 left-3 z-50 flex w-64 flex-col rounded-[27px] border-r border-black/5 bg-white/80 p-4 backdrop-blur-2xl transition-transform dark:border-white/5 dark:bg-[#191a1f]/95 lg:static lg:translate-x-0 lg:rounded-none', sidebarOpen ? 'translate-x-0' : '-translate-x-[110%]']">
        <div class="mb-8 flex items-center justify-between px-2 pt-2"><RouterLink to="/" class="flex items-center gap-2.5 font-semibold"><span class="grid h-8 w-8 place-items-center rounded-[10px] bg-black text-xs text-white dark:bg-white dark:text-black">M</span>{{ siteName }}</RouterLink><button class="icon-button lg:hidden" @click="sidebarOpen = false"><X :size="18"/></button></div>
        <div class="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-secondary">开发者后台</div>
        <nav class="space-y-1"><button v-for="item in nav" :key="item.id" :class="['sidebar-link', { active: activeTab === item.id }]" @click="switchTab(item.id)"><component :is="item.icon" :size="18"/><span>{{ item.label }}</span><ChevronRight :size="14" class="ml-auto opacity-35"/></button></nav>
        <div class="mt-auto space-y-2"><div class="rounded-2xl bg-black/[.035] p-3 dark:bg-white/[.055]"><div class="flex items-center gap-2"><CircleUserRound :size="20"/><div class="min-w-0"><p class="truncate text-sm font-semibold">{{ auth.profile.value?.nickname }}</p><p class="truncate text-[11px] text-secondary">{{ auth.profile.value?.email }}</p></div></div></div><button class="sidebar-link text-red-500" @click="logout"><LogOut :size="18"/>退出登录</button></div>
      </aside>

      <section class="min-w-0 flex-1 overflow-auto">
        <header class="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-blue-100/70 bg-white/60 px-4 backdrop-blur-xl dark:border-white/5 dark:bg-[#0c1d33]/80 sm:px-7"><div class="flex items-center gap-3"><button class="icon-button lg:hidden" @click="sidebarOpen = true"><Menu :size="20"/></button><div><p class="text-xs text-secondary">{{ siteName }} · {{ siteSubtitle }}</p><h1 class="font-semibold">{{ nav.find(v => v.id === activeTab)?.label }}</h1></div></div><div class="flex items-center gap-2"><span v-if="activeTab === 'config'" class="hidden text-xs text-secondary sm:inline" aria-live="polite">{{ configSaveState === 'pending' ? '有未保存修改' : configSaveState === 'saving' ? '正在自动保存…' : configSaveState === 'error' ? '自动保存失败' : configSaveState === 'saved' ? '已自动保存' : '自动保存已开启' }}</span><span v-else-if="activeTab === 'announcements'" class="hidden text-xs text-secondary sm:inline" aria-live="polite">{{ announcementSaving ? '正在同步…' : '公告实时同步已开启' }}</span><RouterLink to="/" class="secondary-button !rounded-xl !px-3 !py-2 text-xs">查看前台</RouterLink><RouterLink to="/dashboard" class="secondary-button hidden !rounded-xl !px-3 !py-2 text-xs sm:inline-flex">个人控制台</RouterLink><button class="icon-button" title="刷新数据" @click="loadAll"><RefreshCw :size="17" :class="{ 'animate-spin': loading }"/></button></div></header>
        <div class="p-4 sm:p-7">
          <div v-if="errorMessage" class="alert-error mb-5"><Ban :size="18"/>{{ errorMessage }}<button class="ml-auto" @click="errorMessage = ''"><X :size="16"/></button></div>

          <template v-if="activeTab === 'overview'">
            <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p class="section-label">LIVE OPERATIONS</p><h2 class="text-2xl font-semibold tracking-tight">控制面板</h2><p class="mt-1 text-sm text-secondary">站内真实访问与报名数据，访问事件到达后自动刷新。</p></div><span class="live-indicator"><i/>实时更新{{ analytics.generated_at ? ` · ${new Date(analytics.generated_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '' }}</span></div>
            <div class="overview-metrics"><article class="overview-metric blue"><span><Eye :size="17"/>今日访客</span><strong>{{ analytics.visitors_today }}</strong><small>去重后的实际浏览人数</small></article><article class="overview-metric violet"><span><BarChart3 :size="17"/>今日浏览量</span><strong>{{ analytics.page_views_today }}</strong><small>站内页面访问次数</small></article><article class="overview-metric green"><span><Zap :size="17"/>实时在线</span><strong>{{ analytics.online_visitors }}</strong><small>过去 5 分钟活跃访客</small></article><article class="overview-metric amber"><span><Users :size="17"/>注册用户</span><strong>{{ analytics.registered_users }}</strong><small>其中 {{ analytics.registrations_total }} 人已提交报名</small></article></div>
            <div class="overview-grid"><section class="admin-card overview-chart-card"><div class="overview-card-head"><div><p class="section-label">LAST 7 DAYS</p><h3>访问趋势</h3></div><div class="chart-legend"><span><i class="visitor"/>访客</span><span><i class="views"/>浏览量</span></div></div><div class="trend-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="近七日访问趋势图"><line v-for="line in [14, 38, 62, 86]" :key="line" x1="0" x2="100" :y1="line" :y2="line"/><polyline class="chart-views" :points="viewChartPoints"/><polyline class="chart-visitors" :points="visitorChartPoints"/></svg><div class="trend-labels"><span v-for="item in analytics.trend" :key="item.date">{{ item.date }}</span></div></div></section><section class="admin-card overview-pages-card"><div class="overview-card-head"><div><p class="section-label">POPULARITY</p><h3>热门页面</h3></div><span class="text-xs text-secondary">近 7 天</span></div><div v-if="analytics.top_pages.length" class="top-page-list"><div v-for="(item, index) in analytics.top_pages" :key="item.path" class="top-page-row"><b>0{{ index + 1 }}</b><span class="truncate">{{ item.path }}</span><strong>{{ item.views }}</strong></div></div><div v-else class="overview-empty">等待第一批真实访问数据…</div></section></div>
            <section class="admin-card overview-summary"><div><p class="section-label">REGISTRATION PULSE</p><h3>报名进度</h3><p>当前有 {{ analytics.registrations_pending }} 份报名等待审核。</p></div><div class="overview-summary-numbers"><span><b>{{ analytics.registrations_total }}</b> 已报名</span><span><b>{{ analytics.registrations_pending }}</b> 待审核</span><button class="secondary-button !rounded-xl !px-3 !py-2 text-xs" @click="switchTab('registrations')">进入报名管理</button></div></section>
          </template>

          <template v-else-if="activeTab === 'announcements'">
            <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p class="section-label">CONSOLE ANNOUNCEMENT</p><h2 class="text-2xl font-semibold tracking-tight">公告管理</h2><p class="mt-1 text-sm text-secondary">发布后会实时同步到所有用户的控制台首页。</p></div><span class="live-indicator"><i/>实时同步已开启</span></div>
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(290px,.75fr)]">
              <section class="admin-card config-card"><div class="config-card-head"><div class="config-card-icon"><Mail :size="20"/></div><div><h3>发布新公告</h3><p>新公告会立即出现在用户控制台；最多 1000 个字。</p></div></div><div class="space-y-4"><label class="field-label">标题<input v-model.trim="announcementDraft.title" class="field-input standalone" maxlength="120" placeholder="例如：报名审核进度通知"></label><label class="field-label">公告内容<textarea v-model="announcementDraft.content" class="field-input standalone min-h-48" maxlength="1000" placeholder="例如：报名审核将在 3 个工作日内完成，请留意邮箱通知。"></textarea></label></div><div class="mt-3 flex items-center justify-between gap-3 text-xs text-secondary"><span>{{ announcementDraft.content.length }} / 1000</span><button class="primary-button !rounded-xl !px-3 !py-2 text-xs" :disabled="announcementSaving" @click="createAnnouncement"><Plus :size="15"/>发布公告</button></div></section>
              <aside class="admin-card config-card"><div class="config-card-head"><div class="config-card-icon"><Eye :size="20"/></div><div><h3>用户端预览</h3><p>置顶公告优先展示，否则显示最新公告。</p></div></div><div class="rounded-2xl border border-black/5 bg-black/[.025] p-5 dark:border-white/10 dark:bg-white/[.04]"><p class="section-label">{{ announcements[0]?.is_pinned ? '置顶公告' : '最新公告' }}</p><h4 class="mt-3 font-semibold">{{ announcements[0]?.title || '暂无公告' }}</h4><p class="mt-2 whitespace-pre-wrap text-sm leading-7 text-primary">{{ announcements[0]?.content || '发布一条公告后，用户将会在控制台首页看到它。' }}</p></div></aside>
            </div>
            <section class="admin-card mt-4"><div class="overview-card-head"><div><p class="section-label">ALL ANNOUNCEMENTS</p><h3>公告列表</h3></div><span class="text-xs text-secondary">共 {{ announcements.length }} 条</span></div><div class="mt-4 space-y-3"><article v-for="item in announcements" :key="item.id" class="flex flex-col gap-3 rounded-2xl border border-black/5 p-4 dark:border-white/10 sm:flex-row sm:items-center"><div class="min-w-0 flex-1"><div class="flex items-center gap-2"><strong class="truncate">{{ item.title }}</strong><span v-if="item.is_pinned" class="security-status-pill allowed">已置顶</span></div><p class="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-secondary">{{ item.content }}</p><small class="mt-2 block text-xs text-secondary">发布于 {{ new Date(item.created_at).toLocaleString('zh-CN') }}</small></div><div class="flex shrink-0 items-center gap-2"><button v-if="!item.is_pinned" class="secondary-button !rounded-xl !px-3 !py-2 text-xs" :disabled="announcementSaving" @click="pinAnnouncement(item)"><Pin :size="15"/>置顶</button><button class="secondary-button !rounded-xl !px-3 !py-2 text-xs text-red-500" :disabled="announcementSaving" @click="deleteAnnouncement(item)"><Trash2 :size="15"/>删除</button></div></article><div v-if="!announcements.length" class="overview-empty">还没有公告。发布第一条后会自动同步给用户。</div></div></section>
          </template>

          <template v-else-if="activeTab === 'security'">
            <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p class="section-label">EDGE SECURITY</p><h2 class="text-2xl font-semibold tracking-tight">安全中心</h2><p class="mt-1 text-sm text-secondary">监控登录与注册风控请求，自动识别暴力尝试并按 IP、设备标识临时限制。</p></div><span class="live-indicator"><i/>边缘防护运行中</span></div>
            <div class="overview-metrics security-metrics"><article class="overview-metric blue"><span><Eye :size="17"/>今日安全请求</span><strong>{{ security.todayRequests }}</strong><small>登录、注册代理请求</small></article><article class="overview-metric violet"><span><Users :size="17"/>近 7 日访问 IP</span><strong>{{ security.uniqueIps7d }}</strong><small>按边缘 IP 去重</small></article><article class="overview-metric amber"><span><Zap :size="17"/>近 30 分钟请求</span><strong>{{ security.requests30m }}</strong><small>实时风控窗口</small></article><article class="overview-metric red"><span><ShieldCheck :size="17"/>活跃攻击源</span><strong>{{ security.activeAttacks }}</strong><small>失败或已拦截请求</small></article><article class="overview-metric green"><span><Ban :size="17"/>已限制 IP</span><strong>{{ security.blockedIps }}</strong><small>到期后自动恢复</small></article><article class="overview-metric blue"><span><CircleUserRound :size="17"/>记录设备</span><strong>{{ security.knownMachines }}</strong><small>仅保存匿名设备标识</small></article></div>
            <div class="security-grid mt-4"><section class="admin-card security-trend-card"><div class="overview-card-head"><div><p class="section-label">14 DAY MONITOR</p><h3>访问与攻击趋势</h3></div><span class="text-xs text-secondary">自动保留 14 天</span></div><div class="security-bars"><div v-for="item in security.trend" :key="item.date" class="security-bar-day"><div class="security-bar-stack"><i :style="{ height: `${Math.max(4, item.requests ? item.requests / Math.max(...security.trend.map(v => v.requests), 1) * 100 : 4)}%` }"/><b :style="{ height: `${Math.max(2, item.attacks ? item.attacks / Math.max(...security.trend.map(v => v.requests), 1) * 100 : 2)}%` }"/></div><span>{{ item.date }}</span></div></div><div class="security-chart-legend"><span><i class="request"/>安全请求</span><span><i class="attack"/>异常请求</span></div></section><section class="admin-card security-risk-card"><div class="overview-card-head"><div><p class="section-label">RISK SOURCES</p><h3>高风险来源</h3></div><span class="text-xs text-secondary">近 7 天</span></div><div v-if="security.riskSources.length" class="security-risk-list"><div v-for="source in security.riskSources" :key="source.ip" class="security-risk-row"><div><strong>{{ source.ip }}</strong><small>失败 {{ source.failures }} 次 · 请求 {{ source.requests }} 次</small></div><button v-if="source.blocked" class="security-status-pill blocked" disabled>已限制</button><button v-else class="security-mini-action" @click="blockRiskSource(source)">立即封禁</button></div></div><div v-else class="overview-empty">暂无异常请求</div></section></div>
            <div class="security-grid mt-4"><section class="admin-card security-block-card"><div class="overview-card-head"><div><p class="section-label">ACCESS CONTROL</p><h3>IP / 设备限制</h3></div><span class="text-xs text-secondary">自动限制：10 分钟内失败 8 次</span></div><div class="security-block-form"><select v-model="securityForm.type" class="compact-select"><option value="ip">IP 地址</option><option value="machine">设备标识</option></select><input v-model.trim="securityForm.value" class="field-input standalone" :placeholder="securityForm.type === 'ip' ? '例如：203.0.113.10' : '粘贴设备标识哈希值'"><select v-model.number="securityForm.durationMinutes" class="compact-select"><option :value="30">30 分钟</option><option :value="60">1 小时</option><option :value="360">6 小时</option><option :value="1440">24 小时</option><option :value="10080">7 天</option></select><input v-model.trim="securityForm.reason" class="field-input standalone" placeholder="限制原因（可选）"><button class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" :disabled="securityActionLoading" @click="createSecurityBlock"><Ban :size="16"/>立即限制</button></div><p class="security-privacy-note">设备标识是浏览器生成的匿名安装 ID，不是硬件指纹；用户清除浏览器存储后会改变，但 IP 限制仍然有效。</p><div class="table-wrap mt-4"><table><thead><tr><th>对象</th><th>类型</th><th>原因</th><th>到期时间</th><th class="text-right">操作</th></tr></thead><tbody><tr v-for="block in security.blocks" :key="block.id"><td><strong>{{ block.type === 'ip' ? block.value : `${block.value.slice(0, 16)}…` }}</strong><small>{{ block.automatic ? '系统自动' : '管理员手动' }}</small></td><td>{{ block.type === 'ip' ? 'IP 地址' : '设备标识' }}</td><td>{{ block.reason }}</td><td>{{ new Date(block.expiresAt).toLocaleString('zh-CN') }}</td><td class="text-right"><button class="security-mini-action" @click="unblockSecurity(block)">解除限制</button></td></tr><tr v-if="!security.blocks.length"><td colspan="5" class="empty-cell">当前没有活跃限制</td></tr></tbody></table></div></section><section class="admin-card security-events-card"><div class="overview-card-head"><div><p class="section-label">RECENT EVENTS</p><h3>最近安全事件</h3></div><button class="icon-button" title="刷新安全数据" @click="loadSecurity"><RefreshCw :size="16" :class="{ 'animate-spin': securityLoading }"/></button></div><div class="security-event-list"><div v-for="event in security.events.slice(0, 12)" :key="event.id" class="security-event-row"><span :class="['security-event-dot', securityOutcomeClass(event.outcome)]"/><div><strong>{{ event.action === 'login' ? '登录' : '注册' }} · {{ securityOutcomeLabel(event.outcome) }}</strong><small>{{ event.ip }} · {{ new Date(event.createdAt).toLocaleString('zh-CN') }}</small></div><span v-if="event.reason" class="security-event-reason">{{ event.reason }}</span></div><div v-if="!security.events.length" class="overview-empty">等待安全事件</div></div></section></div>
            <div class="security-grid mt-4"><section class="admin-card security-block-card"><div class="overview-card-head"><div><p class="section-label">ACCESS CONTROL</p><h3>IP / 设备限制</h3></div><span class="text-xs text-secondary">自动限制：10 分钟内失败 8 次</span></div><div class="security-block-form"><select v-model="securityForm.type" class="compact-select"><option value="ip">IP 地址</option><option value="machine">设备标识</option></select><input v-model.trim="securityForm.value" class="field-input standalone" :placeholder="securityForm.type === 'ip' ? '例如：203.0.113.10' : '粘贴设备标识哈希值'"><select v-model.number="securityForm.durationMinutes" class="compact-select"><option :value="30">30 分钟</option><option :value="60">1 小时</option><option :value="360">6 小时</option><option :value="1440">24 小时</option><option :value="10080">7 天</option></select><input v-model.trim="securityForm.reason" class="field-input standalone" placeholder="限制原因（可选）"><button class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" :disabled="securityActionLoading" @click="createSecurityBlock"><Ban :size="16"/>立即限制</button></div><p class="security-privacy-note">设备标识是浏览器生成的匿名安装 ID，不是硬件指纹；用户清除浏览器存储后会改变，但 IP 限制仍然有效。</p><div class="table-wrap mt-4"><table><thead><tr><th>对象</th><th>类型</th><th>原因</th><th>到期时间</th><th class="text-right">操作</th></tr></thead><tbody><tr v-for="block in security.blocks" :key="block.id"><td><strong>{{ block.type === 'ip' ? block.value : `${block.value.slice(0, 16)}…` }}</strong><small>{{ block.automatic ? '系统自动' : '管理员手动' }}</small></td><td>{{ block.type === 'ip' ? 'IP 地址' : '设备标识' }}</td><td>{{ block.reason }}</td><td>{{ new Date(block.expiresAt).toLocaleString('zh-CN') }}</td><td class="text-right"><button class="security-mini-action" @click="unblockSecurity(block)">解除限制</button></td></tr><tr v-if="!security.blocks.length"><td colspan="5" class="empty-cell">当前没有活跃限制</td></tr></tbody></table></div></section><section class="admin-card security-events-card"><div class="overview-card-head"><div><p class="section-label">RECENT EVENTS</p><h3>最近安全事件</h3></div><button class="icon-button" title="刷新安全数据" @click="loadSecurity"><RefreshCw :size="16" :class="{ 'animate-spin': securityLoading }"/></button></div><div class="security-event-list"><div v-for="event in security.events.slice(0, 12)" :key="event.id" class="security-event-row"><span :class="['security-event-dot', securityOutcomeClass(event.outcome)]"/><div><strong>{{ event.action === 'login' ? '登录' : '注册' }} · {{ securityOutcomeLabel(event.outcome) }}</strong><small>{{ event.ip }} · {{ new Date(event.createdAt).toLocaleString('zh-CN') }}</small></div><span v-if="event.reason" class="security-event-reason">{{ event.reason }}</span></div><div v-if="!security.events.length" class="overview-empty">等待安全事件</div></div></section></div>
            <section class="admin-card security-allow-card mt-4"><div class="overview-card-head"><div><p class="section-label">TRUSTED LIST</p><h3>免封名单与设备标识</h3><p class="mt-1 text-xs text-secondary">免封名单优先于自动封禁；设备标识为匿名 SHA-256 哈希。</p></div></div><div class="security-block-form"><select v-model="allowForm.type" class="compact-select"><option value="ip">免封 IP</option><option value="machine">免封设备</option></select><input v-model.trim="allowForm.value" class="field-input standalone" :placeholder="allowForm.type === 'ip' ? '例如：35.78.66.144' : '选择下方设备或粘贴设备哈希'"><input v-model.trim="allowForm.label" class="field-input standalone" placeholder="名称，例如：我的电脑"><button class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" :disabled="securityActionLoading" @click="addAllowEntry"><ShieldCheck :size="16"/>加入免封</button></div><div class="security-device-list"><div v-for="machine in security.machineIds" :key="machine.value" class="security-device-row"><div><strong>{{ machine.value }}</strong><small>请求 {{ machine.requests }} 次 · 失败 {{ machine.failures }} 次 · 最近 {{ new Date(machine.lastSeen).toLocaleString('zh-CN') }}</small></div><button v-if="!machine.allowlisted" class="security-mini-action" @click="allowSecurity('machine', machine.value, '可信设备')">免封此设备</button><span v-else class="security-status-pill allowed">已免封</span></div><p v-if="!security.machineIds.length" class="overview-empty">暂未观察到设备标识</p></div><div v-if="security.allowlist.length" class="security-allowlist"><div v-for="entry in security.allowlist" :key="entry.id" class="security-allow-row"><div><strong>{{ entry.type === 'ip' ? entry.value : `${entry.value.slice(0, 24)}…` }}</strong><small>{{ entry.label }} · {{ entry.type === 'ip' ? 'IP' : '设备' }}</small></div><button class="security-mini-action" @click="removeSecurityAllow(entry)">移出免封</button></div></div></section>
          </template>

          <template v-else-if="activeTab === 'registrations'">
            <div class="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><div class="metric-card"><span><LayoutGrid :size="18"/>总报名</span><strong>{{ stats.total }}</strong></div><div class="metric-card amber"><span><BarChart3 :size="18"/>待审核</span><strong>{{ stats.pending }}</strong></div><div class="metric-card green"><span><Check :size="18"/>已通过</span><strong>{{ stats.accepted }}</strong></div><div class="metric-card red"><span><X :size="18"/>未通过</span><strong>{{ stats.rejected }}</strong></div></div>
            <div class="admin-card"><div class="admin-toolbar"><div class="search-field"><Search :size="17"/><input v-model="search" placeholder="搜索姓名、邮箱、团队或方向"></div><select v-model="statusFilter" class="compact-select"><option value="all">全部状态</option><option value="pending">待审核</option><option value="accepted">已通过</option><option value="rejected">未通过</option></select><button class="secondary-button !rounded-xl !px-4 !py-2 text-sm" @click="exportCsv"><Download :size="16"/>导出 CSV</button></div>
              <div class="table-wrap"><table><thead><tr><th>参赛者</th><th>团队 / 方向</th><th>状态</th><th>报名时间</th><th class="text-right">操作</th></tr></thead><tbody><tr v-for="item in filteredRegistrations" :key="item.id"><td><strong>{{ item.full_name }}</strong><small>{{ item.profiles?.email || '—' }}</small></td><td>{{ item.team_name || '个人参赛' }}<small>{{ item.track }}</small></td><td><span class="review-status-pill" :class="item.status">{{ item.status === 'pending' ? '待审核' : item.status === 'accepted' ? '已通过' : '未通过' }}</span><small v-if="item.status === 'rejected' && item.rejection_reason" class="review-reason">{{ item.rejection_reason }}</small></td><td>{{ new Date(item.created_at).toLocaleDateString('zh-CN') }}</td><td><div class="table-actions"><button title="编辑" @click="editRegistration(item)"><Pencil :size="16"/></button><button v-if="item.status === 'pending'" title="通过" class="review-action-accept" @click="updateStatus(item, 'accepted')"><Check :size="16"/></button><button v-if="item.status === 'pending'" title="拒绝" class="review-action-reject" @click="updateStatus(item, 'rejected')"><X :size="16"/></button><button title="删除" class="danger" @click="deleteRegistration(item)"><Trash2 :size="16"/></button></div></td></tr><tr v-if="!filteredRegistrations.length"><td colspan="5" class="empty-cell">暂无匹配的报名记录</td></tr></tbody></table></div>
            </div>
          </template>

          <template v-else-if="activeTab === 'reviews'">
            <div class="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p class="section-label">REVIEW QUEUE</p><h2 class="text-2xl font-semibold tracking-tight">审核中心</h2><p class="mt-1 text-sm text-secondary">按状态筛选报名并处理审核结果，拒绝时必须填写理由。</p></div><span class="review-count">显示 {{ filteredReviewRegistrations.length }} 条</span></div>
            <div class="admin-card review-list-card"><div class="review-toolbar"><div class="search-field"><Search :size="17"/><input v-model="reviewSearch" placeholder="搜索姓名、邮箱、团队、方向或单位"></div><select v-model="reviewFilter" class="compact-select"><option value="pending">未审核</option><option value="reviewed">已审核</option><option value="all">全部状态</option></select></div><div class="review-list-head"><span>选手</span><span>团队 / 方向</span><span>审核状态</span><span>提交时间</span><span class="text-right">操作</span></div><div class="review-queue"><article v-for="item in filteredReviewRegistrations" :key="item.id" class="review-row"><div class="review-person"><strong>{{ item.full_name }}</strong><small>{{ item.applicant_email || item.profiles?.email || '—' }}</small></div><div class="review-track"><strong>{{ item.team_name || '个人参赛' }}</strong><small>{{ item.track || '未选择方向' }} · {{ item.participation_mode || '—' }}</small></div><div><select :value="item.status" class="status-select" :class="item.status" @change="updateStatus(item, ($event.target as HTMLSelectElement).value as RegistrationStatus, $event)"><option value="pending">待审核</option><option value="accepted">已通过</option><option value="rejected">未通过</option></select><small v-if="item.status === 'rejected' && item.rejection_reason" class="review-reason">{{ item.rejection_reason }}</small></div><time>{{ new Date(item.submitted_at || item.created_at).toLocaleString('zh-CN') }}</time><div class="review-row-actions"><button title="查看详情" @click="editRegistration(item)"><Pencil :size="16"/></button><button v-if="item.status === 'pending'" title="通过并通知" class="review-action-accept" @click="updateStatus(item, 'accepted')"><Check :size="16"/></button><button v-if="item.status === 'pending'" title="拒绝并填写理由" class="review-action-reject" @click="updateStatus(item, 'rejected')"><X :size="16"/></button></div></article><div v-if="!filteredReviewRegistrations.length" class="empty-cell review-empty">没有符合当前搜索和筛选条件的报名。</div></div></div>
          </template>

          <template v-else-if="activeTab === 'checkin'">
            <div class="mb-6"><p class="section-label">EVENT CHECK-IN</p><h2 class="text-2xl font-semibold tracking-tight">扫码签到</h2><p class="mt-1 text-sm text-secondary">使用现场设备扫描已通过审核选手的签到二维码。</p></div>
            <section class="admin-card mb-5 checkin-session-card"><div><p class="section-label">STEP 1 · CREATE ROSTER</p><h3 class="mt-1 font-semibold">新建签到列表</h3><p class="mt-1 text-sm text-secondary">新建后，系统会自动导入当前 {{ stats.accepted }} 名已审核通过的报名选手。</p></div><div class="checkin-session-form"><input v-model.trim="checkinSessionName" class="field-input standalone" maxlength="80" placeholder="例如：HackFlow 2026 主会场签到"><button type="button" class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" :disabled="!stats.accepted || loading" @click="prepareCheckinRoster"><ClipboardCheck :size="16"/>创建并导入名单</button></div></section>
            <section class="admin-card mb-5 max-w-[980px] overflow-hidden"><div class="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3"><div><p class="section-label">STEP 2 · SELECT ROSTER</p><h3 class="mt-1 font-semibold">已创建的签到列表</h3></div><span class="text-sm text-secondary">{{ checkinSessions.length }} 个列表</span></div><div v-if="!checkinSessions.length" class="p-8 text-center text-sm text-secondary">还没有创建签到列表，请先完成第一步。</div><div v-else class="checkin-session-list"><article v-for="session in checkinSessions" :key="session.id" class="checkin-session-row" :class="{ active: selectedCheckinSessionId === session.id }"><div class="checkin-icon"><ClipboardCheck :size="20"/></div><button type="button" class="min-w-0 flex-1 text-left" @click="selectedCheckinSessionId = session.id"><h4 class="truncate font-medium">{{ session.name }}</h4><p class="mt-1 text-xs text-secondary">{{ sessionRosterStats(session.id).total }} 人已导入 · {{ sessionRosterStats(session.id).checkedIn }} 人已签到 · 创建于 {{ new Date(session.created_at).toLocaleString('zh-CN') }}</p></button><button type="button" class="secondary-button !rounded-xl !px-3 !py-2 text-xs" @click="selectedCheckinSessionId = session.id">进入签到</button><button type="button" class="icon-button danger" :title="`删除 ${session.name}`" @click="deleteCheckinSession(session)"><Trash2 :size="17"/></button></article></div></section>
            <div class="checkin-active-roster"><p class="section-label">STEP 3 · CHECK IN</p><h3 class="mt-1 font-semibold">{{ selectedCheckinSession ? `正在签到：${selectedCheckinSession.name}` : '请选择一个签到列表后开始签到' }}</h3></div>
            <div class="checkin-layout" :class="{ 'checkin-disabled': !selectedCheckinSession }"><div class="admin-card checkin-scanner-card"><div class="checkin-video-wrap"><video ref="scannerVideo" autoplay muted playsinline></video><div v-if="!scannerActive" class="checkin-video-placeholder"><QrCode :size="34"/><span>{{ selectedCheckinSession ? '点击下方按钮开启摄像头' : '请先选择签到列表' }}</span></div></div><div class="checkin-actions"><button v-if="!scannerActive" class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" :disabled="!selectedCheckinSession || checkinProcessing" @click="startScanner"><QrCode :size="16"/>开启扫码</button><button v-else class="secondary-button !rounded-xl !px-4 !py-2.5 text-sm" @click="stopScanner">停止扫码</button></div></div><div class="admin-card checkin-manual-card"><div class="mb-5 flex items-center gap-3"><div class="checkin-icon"><QrCode :size="21"/></div><div><h3 class="font-semibold">手动签到</h3><p class="text-xs text-secondary">摄像头不可用时输入二维码中的签到码</p></div></div><input v-model.trim="manualCheckInToken" class="field-input standalone" :disabled="!selectedCheckinSession || checkinProcessing" placeholder="粘贴签到码或 HACKFLOW-CHECKIN:..." @keyup.enter="submitManualCheckIn"><button class="primary-button mt-4 !rounded-xl !px-4 !py-2.5 text-sm" :disabled="!manualCheckInToken || !selectedCheckinSession || checkinProcessing" @click="submitManualCheckIn">{{ checkinProcessing ? '正在签到…' : '确认签到' }}</button><div v-if="scannerMessage" class="checkin-message" :class="{ success: scannerMessage.includes('成功') }">{{ scannerMessage }}</div></div></div>
            <section v-if="selectedCheckinSession" class="admin-card mt-5 max-w-[980px]"><div class="overview-card-head"><div><p class="section-label">CHECK-IN ROSTER</p><h3>签到名单</h3><p class="mt-1 text-xs text-secondary">可随时查看已签到和未签到的选手。</p></div><div class="flex gap-2"><button :class="['secondary-button !rounded-xl !px-3 !py-2 text-xs', { '!border-blue-400 !text-blue-400': checkinRosterFilter === 'all' }]" @click="checkinRosterFilter = 'all'">全部 {{ selectedSessionRoster.length }}</button><button :class="['secondary-button !rounded-xl !px-3 !py-2 text-xs', { '!border-green-400 !text-green-400': checkinRosterFilter === 'checked-in' }]" @click="checkinRosterFilter = 'checked-in'">已签到 {{ selectedSessionCheckedIn.length }}</button><button :class="['secondary-button !rounded-xl !px-3 !py-2 text-xs', { '!border-amber-400 !text-amber-400': checkinRosterFilter === 'pending' }]" @click="checkinRosterFilter = 'pending'">未签到 {{ selectedSessionPending.length }}</button></div></div><div class="mt-4 grid gap-2 sm:grid-cols-2"><article v-for="item in visibleSessionRoster" :key="item.id" class="flex items-center justify-between gap-3 rounded-xl border border-black/5 px-4 py-3 dark:border-white/10"><div class="min-w-0"><strong class="block truncate text-sm">{{ item.full_name }}</strong><small class="block truncate text-xs text-secondary">{{ item.applicant_email || item.profiles?.email || '未填写邮箱' }} · {{ item.team_name || '个人参赛' }}</small></div><span :class="['shrink-0 rounded-full px-2.5 py-1 text-xs', item.checked_in_at ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500']">{{ item.checked_in_at ? '已签到' : '未签到' }}</span></article><div v-if="!visibleSessionRoster.length" class="overview-empty sm:col-span-2">当前筛选下没有选手。</div></div></section>
          </template>

          <template v-else-if="activeTab === 'teams'">
            <div class="mb-5"><p class="section-label">TEAM DIRECTORY</p><h2 class="text-2xl font-semibold tracking-tight">队伍管理</h2><p class="mt-1 text-sm text-secondary">查看全部队伍、成员与待审核入队申请；必要时可解散队伍。</p></div>
            <div class="admin-card"><div v-if="!teams.length" class="empty-cell p-10 text-center">暂时没有创建队伍。</div><div v-else class="divide-y divide-black/5 dark:divide-white/5"><article v-for="team in teams" :key="team.id" class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><div class="min-w-0 flex-1"><h3 class="font-semibold">{{ team.name }}</h3><p class="mt-1 text-xs text-secondary">邀请码：{{ team.invite_code }} · 创建于 {{ new Date(team.created_at).toLocaleString('zh-CN') }}</p><div class="mt-3 flex flex-wrap gap-2"><span v-for="member in team.members" :key="member.user_id" class="rounded-full bg-black/5 px-2.5 py-1 text-xs dark:bg-white/10">{{ member.nickname || member.email }} · {{ member.role === 'leader' ? '队长' : member.role === 'pending' ? '待审核' : '队员' }}</span></div></div><button class="secondary-button !rounded-xl !px-3 !py-2 text-xs text-red-400" @click="deleteTeam(team)"><Trash2 :size="15"/>解散队伍</button></article></div></div>
          </template>
          <template v-else-if="activeTab === 'users'">
            <div class="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 class="text-2xl font-semibold tracking-tight">用户账号</h2><p class="mt-1 text-sm text-secondary">创建、管理与封禁平台账号。</p></div><button class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" @click="openNewUser"><Plus :size="17"/>新增用户</button></div>
            <div class="admin-card"><div class="admin-toolbar"><div class="search-field max-w-md"><Search :size="17"/><input v-model="search" placeholder="搜索邮箱或昵称"></div></div><div class="table-wrap"><table><thead><tr><th>用户</th><th>角色</th><th>账号状态</th><th>注册时间</th><th class="text-right">操作</th></tr></thead><tbody><tr v-for="item in profiles.filter(v => !search || `${v.email} ${v.nickname}`.toLowerCase().includes(search.toLowerCase()))" :key="item.id"><td><strong>{{ item.nickname }}</strong><small>{{ item.email }}</small></td><td><span class="role-pill" :class="item.role"><ShieldCheck v-if="item.role === 'admin'" :size="13"/><CircleUserRound v-else :size="13"/>{{ item.is_owner ? '站点所有者' : item.role === 'admin' ? '管理员' : '普通用户' }}</span></td><td><span class="account-pill" :class="item.status"><i/>{{ item.status === 'active' ? '正常' : '已封禁' }}</span></td><td>{{ new Date(item.created_at).toLocaleDateString('zh-CN') }}</td><td><div class="table-actions"><button title="编辑" @click="openEditUser(item)"><Pencil :size="16"/></button><button :title="item.is_owner ? '所有者不可封禁' : item.status === 'active' ? '封禁' : '解封'" :disabled="item.is_owner && !auth.profile.value?.is_owner" @click="toggleBan(item)"><Ban v-if="item.status === 'active'" :size="16"/><Check v-else :size="16"/></button><button title="删除" class="danger" :disabled="item.id === auth.user.value?.id || item.is_owner" @click="deleteUser(item)"><Trash2 :size="16"/></button></div></td></tr></tbody></table></div></div>
          </template>

          <template v-else>
            <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p class="section-label">SYSTEM STUDIO</p><h2 class="mt-1 text-2xl font-semibold tracking-tight">系统配置</h2><p class="mt-1 text-sm text-secondary">集中管理前台内容、站点图标、协议及邮件服务，停止输入后会自动保存。</p></div><button class="primary-button !rounded-xl !px-4 !py-2.5 text-sm" @click="saveConfig()"><Save :size="16"/>立即保存</button></div>
            <div class="config-tabs mb-5"><button :class="{ active: configSection === 'frontend' }" @click="configSection = 'frontend'"><Home :size="16"/>前台与首页</button><button :class="{ active: configSection === 'team' }" @click="configSection = 'team'"><Users :size="16"/>团队页面</button><button :class="{ active: configSection === 'registration' }" @click="configSection = 'registration'"><ClipboardCheck :size="16"/>报名管理</button><button :class="{ active: configSection === 'rules' }" @click="configSection = 'rules'"><FileText :size="16"/>协议内容</button><button :class="{ active: configSection === 'email' }" @click="configSection = 'email'"><Palette :size="16"/>邮件模板</button><button :class="{ active: configSection === 'smtp' }" @click="configSection = 'smtp'"><Mail :size="16"/>SMTP 服务</button></div>

            <template v-if="configSection === 'frontend'">
              <div class="config-grid"><section class="admin-card config-card"><div class="config-card-head"><div class="config-card-icon"><Palette :size="20"/></div><div><h3>站点标识</h3><p>修改导航栏名称、浏览器图标与品牌展示。</p></div></div><div class="space-y-4"><label class="field-label">站点名称<input v-model="config.site_name" class="field-input standalone" maxlength="30" placeholder="HackFlow"></label><label class="field-label">站点图标 URL<input v-model="config.site_icon_url" class="field-input standalone" type="url" placeholder="https://.../logo.png"><small class="mt-1 text-secondary">建议使用正方形 PNG 或 SVG，保存后会更新前台导航图标与浏览器图标。</small></label><div v-if="safeAssetUrl(config.site_icon_url)" class="icon-preview"><img :src="safeAssetUrl(config.site_icon_url)" alt="图标预览"><span>图标预览</span></div></div></section>
                <section class="admin-card config-card"><div class="config-card-head"><div class="config-card-icon"><Image :size="20"/></div><div><h3>视觉素材</h3><p>分别设置首页主视觉与登录、注册页面左侧图片。</p></div></div><div class="space-y-4"><label class="field-label">首页主视觉 URL<input v-model="config.home_hero_image_url" class="field-input standalone" type="url" placeholder="https://images.example.com/home.jpg"></label><label class="field-label">登录 / 注册图片 URL<input v-model="config.auth_hero_image_url" class="field-input standalone" type="url" placeholder="https://images.example.com/auth.jpg"></label><div v-if="safeAssetUrl(config.home_hero_image_url)" class="hero-preview" :style="{ backgroundImage: `url(${safeAssetUrl(config.home_hero_image_url)})` }"><span>首页视觉预览</span></div></div></section></div>
              <section class="admin-card config-card mt-4"><div class="config-card-head"><div class="config-card-icon"><Upload :size="20"/></div><div><h3>上传站点图片</h3><p>可直接上传图片，也可继续使用上方 URL。支持 PNG、JPG、WebP、GIF、SVG，单张不超过 5MB。</p></div></div><div class="form-grid"><label class="field-label">上传站点图标<input class="field-input standalone" type="file" accept="image/*" @change="uploadSiteImage('site_icon_url', $event)"></label><label class="field-label">上传首页主视觉<input class="field-input standalone" type="file" accept="image/*" @change="uploadSiteImage('home_hero_image_url', $event)"></label><label class="field-label sm:col-span-2">上传登录 / 注册左侧图片<input class="field-input standalone" type="file" accept="image/*" @change="uploadSiteImage('auth_hero_image_url', $event)"></label></div></section>
              <section class="admin-card config-card mt-4"><div class="config-card-head"><div class="config-card-icon"><Home :size="20"/></div><div><h3>首页内容</h3><p>停止输入后会自动保存并同步到赛事首页。</p></div></div><div class="form-grid"><label class="field-label">顶部标签<input v-model="config.home_eyebrow" class="field-input standalone" maxlength="60"></label><label class="field-label">主按钮文字<input v-model="config.home_cta_label" class="field-input standalone" maxlength="20"></label><label class="field-label">主标题<input v-model="config.home_title" class="field-input standalone" maxlength="80"></label><label class="field-label">强调标题<input v-model="config.home_highlight" class="field-input standalone" maxlength="80"></label><label class="field-label sm:col-span-2">首页简介<textarea v-model="config.home_subtitle" class="field-input standalone min-h-24" maxlength="240"></textarea></label><label class="field-label">赛事时间<input v-model="config.home_event_date" class="field-input standalone" maxlength="40"></label><label class="field-label">活动地点<input v-model="config.home_location" class="field-input standalone" maxlength="40"></label><label class="field-label">参与人数<input v-model="config.home_capacity" class="field-input standalone" maxlength="40"></label></div></section>
              <section class="admin-card config-card mt-4"><div class="config-card-head"><div class="config-card-icon"><Home :size="20"/></div><div><h3>首页下半部分与页脚</h3><p>赛事介绍、三张功能卡片与页脚文字都可直接编辑。</p></div></div><div class="form-grid"><label class="field-label">站点副标题<input v-model="config.site_subtitle" class="field-input standalone" maxlength="60"></label><label class="field-label">页脚文字<input v-model="config.footer_content" class="field-input standalone" maxlength="160"></label><label class="field-label">介绍区标签<input v-model="config.home_about_label" class="field-input standalone" maxlength="60"></label><label class="field-label">介绍区主标题<input v-model="config.home_about_title" class="field-input standalone" maxlength="80"></label><label class="field-label sm:col-span-2">介绍区强调标题<input v-model="config.home_about_highlight" class="field-input standalone" maxlength="80"></label><label class="field-label sm:col-span-2">介绍区说明<textarea v-model="config.home_about_description" class="field-input standalone min-h-24" maxlength="300"></textarea></label><label class="field-label">卡片一标题<input v-model="config.home_feature_1_title" class="field-input standalone" maxlength="60"></label><label class="field-label">卡片一内容<input v-model="config.home_feature_1_text" class="field-input standalone" maxlength="160"></label><label class="field-label">卡片二标题<input v-model="config.home_feature_2_title" class="field-input standalone" maxlength="60"></label><label class="field-label">卡片二内容<input v-model="config.home_feature_2_text" class="field-input standalone" maxlength="160"></label><label class="field-label">卡片三标题<input v-model="config.home_feature_3_title" class="field-input standalone" maxlength="60"></label><label class="field-label">卡片三内容<input v-model="config.home_feature_3_text" class="field-input standalone" maxlength="160"></label></div></section>
            </template>

            <template v-else-if="configSection === 'team'"><section class="admin-card config-card max-w-5xl"><div class="config-card-head"><div class="config-card-icon"><Users :size="20"/></div><div><h3>团队介绍内容</h3><p>停止输入后会自动保存并立即生效。</p></div></div><div class="space-y-4"><label class="field-label">团队标语<input v-model="config.team_tagline" class="field-input standalone"></label><label class="field-label">团队介绍<textarea v-model="config.team_intro" class="field-input standalone min-h-24"></textarea></label><label class="field-label">核心理念<textarea v-model="config.team_principles" class="field-input standalone min-h-24"></textarea></label></div></section><section class="admin-card config-card mt-4 max-w-5xl"><div class="config-card-head"><div class="config-card-icon"><Image :size="20"/></div><div><h3>核心成员</h3><p>姓名和职务完整后，编辑内容会自动保存。</p></div><button class="secondary-button ml-auto !rounded-xl !px-3 !py-2 text-xs" @click="addTeamMember"><Plus :size="15"/>新增成员</button></div><div class="space-y-4"><article v-for="member in teamMembers" :key="member._key" class="rounded-xl border border-white/10 p-4"><div class="form-grid"><label class="field-label">姓名<input v-model="member.name" class="field-input standalone" placeholder="例如：林然" @input="scheduleTeamMemberSave(member)"></label><label class="field-label">职务<input v-model="member.role" class="field-input standalone" placeholder="例如：社区负责人" @input="scheduleTeamMemberSave(member)"></label><label class="field-label">直接上传照片<input class="field-input standalone" type="file" accept="image/*" @change="uploadTeamMemberImage(member, $event)"></label><label class="field-label">照片 URL（可选）<input v-model="member.image_url" class="field-input standalone" placeholder="上传后会自动填入" @input="scheduleTeamMemberSave(member)"></label><label class="field-label">个人官网链接（可选）<input v-model.trim="member.website_url" class="field-input standalone" type="url" placeholder="https://your-site.com" @input="scheduleTeamMemberSave(member)"></label><label class="field-label">GitHub 链接（可选）<input v-model.trim="member.github_url" class="field-input standalone" type="url" placeholder="https://github.com/username" @input="scheduleTeamMemberSave(member)"></label><label class="field-label sm:col-span-2">成员简介<textarea v-model="member.bio" class="field-input standalone min-h-20" placeholder="例如：负责连接创造者与合作伙伴，让每一次相遇都能产生真实的下一步。" @input="scheduleTeamMemberSave(member)"></textarea></label></div><div class="mt-3 flex gap-3"><button class="primary-button !rounded-xl !px-3 !py-2 text-xs" @click="saveTeamMember(member)">立即保存</button><button class="text-sm text-red-400" @click="deleteSiteTeamMember(member)">删除</button></div></article><p v-if="!teamMembers.length" class="text-sm text-secondary">还没有核心成员。点击“新增成员”后可直接上传照片并填写介绍。</p></div></section></template>
            <template v-else-if="configSection === 'registration'">
              <div class="config-grid registration-ops-grid"><section class="admin-card config-card"><div class="config-card-head"><div class="config-card-icon"><Power :size="20"/></div><div><h3>报名通道</h3><p>关闭后用户仍可登录，但无法提交新的报名资料。</p></div></div><label class="registration-switch"><input v-model="config.registration_open" type="checkbox"><span class="registration-switch-track"><i/></span><b>{{ config.registration_open ? '报名通道已开启' : '报名通道已关闭' }}</b></label><p class="config-card-note">变更会在停止操作后自动保存并立即生效。</p></section><section class="admin-card config-card"><div class="config-card-head"><div class="config-card-icon"><QrCode :size="20"/></div><div><h3>签到名单管理</h3><p>请前往扫码签到页面，新建签到场次后导入已通过审核的选手。</p></div></div><div class="registration-op-stat"><strong>{{ stats.accepted }}</strong><span>名选手已审核通过</span></div><button type="button" class="secondary-button mt-5 !rounded-xl !px-4 !py-2.5 text-sm" @click="switchTab('checkin')"><QrCode :size="16"/>前往扫码签到</button></section></div>
              <section class="admin-card config-card config-danger-card mt-4"><div class="config-card-head"><div class="config-card-icon config-danger-icon"><Archive :size="20"/></div><div><h3>归档并开启下一期</h3><p>将当前报名完整保存到历史归档，再清空当前活动的报名数据。用户账号会保留，可重新填写新一期报名。</p></div></div><div class="form-grid"><label class="field-label sm:col-span-2">归档名称（建议填写活动期次）<input v-model.trim="archiveLabel" class="field-input standalone" maxlength="80" placeholder="例如：HackFlow 2026 春季赛"></label></div><div class="config-danger-actions"><div><strong>当前报名：{{ stats.total }} 条</strong><p>此操作不可撤销，但已归档的数据会保留在数据库历史表中。</p></div><button type="button" class="secondary-button config-danger-button !rounded-xl !px-4 !py-2.5 text-sm" :disabled="!stats.total || loading" @click="clearRegistrationsWithArchive"><Archive :size="16"/>归档并清空</button></div></section>
            </template>

            <section v-else-if="configSection === 'rules'" class="admin-card config-card max-w-5xl"><div class="config-card-head"><div class="config-card-icon"><FileText :size="20"/></div><div><h3>注册协议内容</h3><p>编辑后会自动保存，并在注册页面实时使用。</p></div></div><div class="space-y-4"><label class="field-label">赛事规则<textarea v-model="config.rules_content" class="field-input standalone min-h-40"></textarea></label><label class="field-label">隐私协议<textarea v-model="config.privacy_content" class="field-input standalone min-h-40"></textarea></label></div></section>

            <section v-else-if="configSection === 'email'" class="admin-card config-card max-w-5xl"><div class="config-card-head"><div class="config-card-icon"><Palette :size="20"/></div><div><h3>注册验证邮件模板</h3><p>支持变量 <code>&#123;&#123;code&#125;&#125;</code>、<code>&#123;&#123;email&#125;&#125;</code>，停止输入后自动同步至验证码邮件。</p></div></div><textarea v-model="config.verification_email_template" class="field-input standalone min-h-40 font-mono text-sm"></textarea><div class="template-preview mt-4"><span class="section-label">实时预览</span><p>{{ (config.verification_email_template || '').replaceAll('{' + '{code}' + '}', '48219370').replaceAll('{' + '{email}' + '}', 'participant@example.com') }}</p></div></section>

            <section v-else class="admin-card config-card max-w-5xl"><div class="config-card-head"><div class="config-card-icon"><Mail :size="20"/></div><div><h3>SMTP 发件服务</h3><p>用于注册验证码、审核结果与赛事通知邮件。</p></div><button class="secondary-button ml-auto !rounded-xl !px-4 !py-2 text-sm" type="button" :disabled="loading" @click="testEmail">发送测试邮件</button></div><div class="form-grid"><label class="field-label">SMTP 服务器<input v-model="config.smtp_host" class="field-input standalone" placeholder="smtp.example.com"></label><label class="field-label">端口<input v-model.number="config.smtp_port" class="field-input standalone" min="1" max="65535" type="number"></label><label class="field-label">发件邮箱<input v-model="config.from_email" class="field-input standalone" type="email" placeholder="hackathon@example.com"></label><label class="field-label">SMTP 账号<input v-model="config.smtp_username" class="field-input standalone" autocomplete="off"></label><label class="field-label sm:col-span-2">SMTP 密码 / 授权码<input v-model="config.smtp_password" class="field-input standalone" type="password" autocomplete="new-password" placeholder="仅管理员可读取"></label><label class="field-label sm:col-span-2">审核结果通知模板<textarea v-model="config.notification_template" class="field-input standalone min-h-48 font-mono text-sm"></textarea><small v-pre class="mt-1 text-secondary">可用变量：{{nickname}}、{{status}}</small></label></div></section>
          </template>
        </div>
      </section>
    </div>
    <nav class="admin-mobile-nav" aria-label="移动端后台导航"><button v-for="item in nav" :key="item.id" :class="{ active: activeTab === item.id }" @click="switchTab(item.id)"><component :is="item.icon" :size="18"/><span>{{ item.label.replace('管理', '') }}</span></button><button class="admin-mobile-logout" @click="logout"><LogOut :size="18"/><span>退出</span></button></nav>

    <div v-if="regEditor" class="modal-backdrop" @mousedown.self="regEditor = null"><form class="modal-card review-detail-modal" @submit.prevent="saveRegistration"><div class="modal-head"><div><p class="section-label">APPLICATION DETAIL</p><h2>{{ regEditor.full_name }} 的报名资料</h2><p class="text-secondary">查看并编辑报名信息与审核结果</p></div><button type="button" class="icon-button" @click="regEditor = null"><X :size="19"/></button></div><div class="review-detail-section"><h3>基本资料</h3><div class="review-detail-grid"><label class="field-label">真实姓名<input v-model="regEditor.full_name" class="field-input standalone" required></label><label class="field-label">性别<input v-model="regEditor.gender" class="field-input standalone"></label><label class="field-label">年龄<input v-model.number="regEditor.age" class="field-input standalone" type="number"></label><label class="field-label">学历<input v-model="regEditor.education" class="field-input standalone"></label><label class="field-label">手机号码<input v-model="regEditor.phone" class="field-input standalone" required></label><label class="field-label">邮箱地址<input v-model="regEditor.applicant_email" class="field-input standalone" type="email"></label></div></div><div class="review-detail-section"><h3>参赛信息</h3><div class="review-detail-grid"><label class="field-label">身份（选填）<input v-model="regEditor.identity_type" class="field-input standalone"></label><label class="field-label">学校 / 所属单位（选填）<input v-model="regEditor.organization" class="field-input standalone"></label><label class="field-label">参赛模式<select v-model="regEditor.participation_mode" class="field-input standalone"><option>个人参赛</option><option>寻找队友</option></select></label><label class="field-label">团队名称（选填）<input v-model="regEditor.team_name" class="field-input standalone"></label><label class="field-label">参赛方向<input v-model="regEditor.track" class="field-input standalone"></label><label class="field-label sm:col-span-2">擅长技术栈<input :value="regEditor.skills?.join('，')" class="field-input standalone" @input="regEditor.skills = ($event.target as HTMLInputElement).value.split(/[,，]/).map(v => v.trim()).filter(Boolean)"></label></div></div><div class="review-detail-section"><h3>个人介绍与项目想法</h3><div class="review-detail-grid review-detail-grid-single"><label class="field-label">个人简介<textarea v-model="regEditor.bio" class="field-input standalone min-h-24"></textarea></label><label class="field-label">参赛初衷与项目初步想法<textarea v-model="regEditor.motivation" class="field-input standalone min-h-24"></textarea></label></div></div><div v-if="Number(regEditor.age) < 18" class="review-detail-section"><h3>监护人信息</h3><div class="review-detail-grid"><label class="field-label">家长姓名<input v-model="regEditor.parent_name" class="field-input standalone"></label><label class="field-label">家长联系手机号<input v-model="regEditor.parent_phone" class="field-input standalone"></label></div></div><div class="review-detail-section"><h3>审核处理</h3><div class="review-detail-grid"><label class="field-label">审核状态<select v-model="regEditor.status" class="field-input standalone"><option value="pending">待审核</option><option value="accepted">已通过</option><option value="rejected">未通过</option></select></label><label class="field-label">提交时间<input :value="new Date(regEditor.submitted_at || regEditor.created_at).toLocaleString('zh-CN')" class="field-input standalone" disabled></label><label v-if="regEditor.status === 'rejected'" class="field-label review-detail-wide">拒绝理由<textarea v-model.trim="regEditor.rejection_reason" class="field-input standalone min-h-24" required placeholder="请填写具体原因，用户将通过邮件收到此内容"></textarea></label></div></div><div class="review-detail-links"><span>GitHub：{{ regEditor.github_url || '未填写' }}</span><span>作品集：{{ regEditor.portfolio_url || '未填写' }}</span></div><button class="primary-button mt-6 w-full"><Save :size="17"/>保存修改</button></form></div>
    <div v-if="userEditor" class="modal-backdrop" @mousedown.self="userEditor = null"><form class="modal-card max-w-lg" @submit.prevent="saveUser"><div class="modal-head"><div><p class="section-label">用户账号</p><h2>{{ isNewUser ? '新增用户' : '编辑用户' }}</h2></div><button type="button" class="icon-button" @click="userEditor = null"><X :size="19"/></button></div><div class="space-y-4"><label class="field-label">邮箱<input v-model="userEditor.email" class="field-input standalone" type="email" :disabled="!isNewUser" required></label><label class="field-label">昵称<input v-model="userEditor.nickname" class="field-input standalone" required></label><label class="field-label">{{ isNewUser ? '初始密码' : '重置密码（选填）' }}<input v-model="userEditor.password" class="field-input standalone" type="password" minlength="8" :required="isNewUser" autocomplete="new-password" :placeholder="isNewUser ? '至少 8 位字符' : '留空则保持原密码不变'"></label><div class="form-grid"><label class="field-label">角色<select v-model="userEditor.role" class="field-input standalone"><option value="user">普通用户</option><option value="admin">管理员</option></select></label><label class="field-label">状态<select v-model="userEditor.status" class="field-input standalone"><option value="active">正常</option><option value="banned">封禁</option></select></label></div></div><button class="primary-button mt-6 w-full"><UserCog :size="17"/>{{ isNewUser ? '创建账号' : '保存修改' }}</button></form></div>
    <Transition name="toast"><div v-if="toast" class="toast"><Check :size="17"/>{{ toast }}</div></Transition>
  </main>
</template>
