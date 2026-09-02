<script setup lang="ts">
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Copy, Crown, FilePenLine, LayoutDashboard, LogOut, MapPin, MessageCircle, Save, Settings2, ShieldCheck, Sparkles, Trash2, UserPlus, UserRound, XCircle } from '@lucide/vue'
import QRCode from 'qrcode'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { readableError, supabase } from '../lib/supabase'
import { useBranding } from '../lib/branding'
import type { Registration, RegistrationStatus } from '../lib/types'

const auth = useAuth()
const router = useRouter()
const { siteName, siteSubtitle, loadBranding } = useBranding()
type TeamMember = { user_id: string; role: 'leader' | 'member' | 'pending'; joined_at: string; nickname: string; email: string }
type Team = { id: string; name: string; invite_code: string; leader_id: string; created_at: string; membership_role?: TeamMember['role']; members: TeamMember[] }
type CommunityPost = { id: string; author_id: string; content: string | null; created_at: string; nickname: string; reply_to?: string | null; reply_nickname?: string | null; reply_content?: string | null; retracted_at?: string | null; admin_deleted_at?: string | null }
const loading = ref(true)
const saving = ref(false)
const editing = ref(false)
const errorMessage = ref('')
const saved = ref(false)
const accountSaved = ref(false)
const registration = ref<Registration | null>(null)
const activePanel = ref<'home' | 'registration' | 'application' | 'team' | 'community' | 'profile' | 'settings'>('home')
const applicationStep = ref(1)
const draftSaved = ref(false)
const qrCodeUrl = ref('')
const registrationOpen = ref(true)
const consoleInfo = reactive({ announcementTitle: '最新公告', announcement: '欢迎来到 Matrix Nova 控制台。请留意报名审核状态与赛事通知。', date: '10.16 — 10.18', location: '上海 · 西岸', capacity: '300 位创造者' })
const team = ref<Team | null>(null)
const teamName = ref('')
const inviteCode = ref('')
const teamNotice = ref('')
const transferTarget = ref('')
const communityPosts = ref<CommunityPost[]>([])
const communityDraft = ref('')
const communityLoading = ref(false)
const communityChatRef = ref<HTMLElement | null>(null)
const replyToPost = ref<CommunityPost | null>(null)
const form = reactive({ full_name: '', gender: '', age: null as number | null, education: '', phone: '', applicant_email: '', identity_type: '', organization: '', participation_mode: '个人参赛', team_name: '', skills: '', track: '', bio: '', motivation: '', parent_name: '', parent_phone: '', rules_agreed: false, guardian_agreed: false, github_url: '', portfolio_url: '' })
const accountForm = reactive({ nickname: '', password: '', confirmPassword: '' })
const statusMap: Record<RegistrationStatus, { label: string; tone: string }> = { pending: { label: '审核中', tone: 'amber' }, accepted: { label: '已通过', tone: 'green' }, rejected: { label: '未通过', tone: 'red' } }
const statusInfo = computed(() => registration.value ? statusMap[registration.value.status] : statusMap.pending)
const draftFields = ['full_name', 'gender', 'age', 'education', 'phone', 'applicant_email', 'identity_type', 'organization', 'participation_mode', 'team_name', 'skills', 'track', 'bio', 'motivation', 'parent_name', 'parent_phone', 'rules_agreed', 'guardian_agreed', 'github_url', 'portfolio_url'] as const
let draftTimer: ReturnType<typeof setTimeout> | undefined

function draftStorageKey() { return auth.user.value?.id ? `hackflow:application-draft:${auth.user.value.id}` : '' }
function persistDraft() {
  const key = draftStorageKey()
  if (!key || typeof window === 'undefined') return
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    const data = Object.fromEntries(draftFields.map(field => [field, form[field]]))
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }))
    draftSaved.value = true
  }, 120)
}
function restoreDraft() {
  const key = draftStorageKey()
  if (!key || typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw) as { data?: Record<string, unknown> }
    if (!parsed.data) return
    const restored = Object.fromEntries(draftFields.filter(field => field in parsed.data!).map(field => [field, parsed.data![field]]))
    Object.assign(form, restored)
    draftSaved.value = true
  } catch { localStorage.removeItem(key) }
}
watch(form, persistDraft, { deep: true })

function syncForm(data: Registration) { Object.assign(form, { ...data, skills: data.skills?.join('，') || '', portfolio_url: data.portfolio_url || '' }) }
function openApplication() {
  if (registration.value) {
    errorMessage.value = '报名提交后不可修改。'
    return
  }
  if (!registrationOpen.value && !registration.value) {
    errorMessage.value = '报名通道暂未开放或已关闭，请留意赛事公告。'
    return
  }
  if (!form.track) form.track = 'AI 与智能应用'
  if (!form.applicant_email) form.applicant_email = auth.profile.value?.email || ''
  applicationStep.value = 1
  activePanel.value = 'application'
  errorMessage.value = ''
}
function textLength(value: string) { return Array.from(value.trim()).length }
function isValidPhone(value: string) { return /^1[3-9]\d{9}$/.test(value.trim()) }
function isValidEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) }
function applicationStepError(step = applicationStep.value) {
  if (step === 1) {
    if (!form.full_name || !form.gender || !form.age || !form.education || !form.phone || !form.applicant_email) return '请完成基本资料中的必填项。'
    if (!isValidPhone(form.phone)) return '请输入有效的 11 位手机号码。'
    if (!isValidEmail(form.applicant_email)) return '请输入有效的邮箱地址。'
  }
  if (step === 2 && (!form.participation_mode || !form.skills.trim())) return '参赛模式和擅长技术栈为必填项。'
  if (step === 3) {
    if (textLength(form.bio) < 50 || textLength(form.bio) > 100) return '个人简介需要控制在 50–100 字之间。'
    if (textLength(form.motivation) < 50 || textLength(form.motivation) > 100) return '参赛初衷与项目想法需要控制在 50–100 字之间。'
    if (!form.rules_agreed) return '请阅读并同意赛事规则和隐私协议。'
    if (Number(form.age) < 18 && (!form.parent_name || !form.parent_phone || !form.guardian_agreed)) return '未满 18 岁需要补充监护人信息并确认同意。'
  }
  return ''
}
function nextApplicationStep() {
  const message = applicationStepError()
  if (message) { errorMessage.value = message; return }
  if (applicationStep.value < 3) { applicationStep.value += 1; errorMessage.value = '' }
}
function previousApplicationStep() { if (applicationStep.value > 1) { applicationStep.value -= 1; errorMessage.value = '' } }
async function loadTeam() {
  const { data, error } = await supabase.rpc('get_my_team')
  if (error) { errorMessage.value = readableError(error); return }
  team.value = data as Team | null
  transferTarget.value = ''
}
async function createTeam() {
  if (saving.value) return
  if (!teamName.value.trim()) { errorMessage.value = '请填写队伍名称。'; return }
  saving.value = true; errorMessage.value = ''
  const { data, error } = await supabase.rpc('create_my_team', { p_name: teamName.value.trim() })
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  team.value = data as Team; teamName.value = ''; teamNotice.value = '队伍已创建，你现在是队长。'
}
async function joinTeam() {
  if (saving.value) return
  if (!inviteCode.value.trim()) { errorMessage.value = '请输入队长分享的邀请码。'; return }
  saving.value = true; errorMessage.value = ''
  const { data, error } = await supabase.rpc('join_team_by_invite', { p_invite_code: inviteCode.value.trim() })
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  team.value = data as Team; inviteCode.value = ''; teamNotice.value = '已成功加入队伍。'
}
async function copyInviteCode() {
  if (!team.value) return
  try { await navigator.clipboard.writeText(team.value.invite_code); teamNotice.value = '邀请码已复制，可直接分享给队友。' }
  catch { teamNotice.value = `邀请码：${team.value.invite_code}` }
}
async function transferTeamLeadership() {
  if (saving.value) return
  if (!transferTarget.value) { errorMessage.value = '请选择要转让的队员。'; return }
  saving.value = true; errorMessage.value = ''
  const { data, error } = await supabase.rpc('transfer_my_team_leadership', { p_new_leader: transferTarget.value })
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  team.value = data as Team; transferTarget.value = ''; teamNotice.value = '队长身份已转让。'
}
async function reviewJoinRequest(member: TeamMember, approve: boolean) {
  if (saving.value) return
  saving.value = true; errorMessage.value = ''
  const { data, error } = await supabase.rpc('review_team_join_request', { p_user_id: member.user_id, p_approve: approve })
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  team.value = data as Team; teamNotice.value = approve ? '已同意该队员加入。' : '已拒绝该入队申请。'
}
async function removeTeamMember(member: TeamMember) {
  if (saving.value) return
  if (!window.confirm(`确定移除 ${member.nickname || member.email} 吗？`)) return
  saving.value = true; errorMessage.value = ''
  const { data, error } = await supabase.rpc('remove_my_team_member', { p_user_id: member.user_id })
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  team.value = data as Team; teamNotice.value = '队员已移除。'
}
async function leaveTeam() {
  if (saving.value) return
  if (!team.value || !window.confirm(team.value.leader_id === auth.user.value?.id && team.value.members.length === 1 ? '确定解散这个队伍吗？' : '确定退出当前队伍吗？')) return
  saving.value = true; errorMessage.value = ''
  const { error } = await supabase.rpc('leave_my_team')
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  team.value = null; teamNotice.value = '已退出队伍。'
}
async function loadCommunity() {
  communityLoading.value = true
  const { data, error } = await supabase.rpc('get_community_posts')
  communityLoading.value = false
  if (error) { errorMessage.value = readableError(error); return }
  communityPosts.value = (data || []) as CommunityPost[]
  await nextTick()
  if (communityChatRef.value) communityChatRef.value.scrollTop = communityChatRef.value.scrollHeight
}
async function publishCommunityPost() {
  if (saving.value) return
  if (!communityDraft.value.trim() || !auth.user.value) return
  saving.value = true; errorMessage.value = ''
  const { error } = await supabase.from('community_posts').insert({ author_id: auth.user.value.id, content: communityDraft.value.trim(), reply_to: replyToPost.value?.id || null })
  saving.value = false
  if (error) { errorMessage.value = readableError(error); return }
  communityDraft.value = ''; replyToPost.value = null; await loadCommunity()
}
async function deleteCommunityPost(post: CommunityPost) {
  const isOwn = post.author_id === auth.user.value?.id
  if (!window.confirm(isOwn ? '确定撤回这条消息吗？' : '确定以管理员身份删除这条消息吗？')) return
  const { error } = await supabase.rpc(isOwn ? 'retract_my_community_post' : 'admin_remove_community_post', { p_post_id: post.id })
  if (error) { errorMessage.value = readableError(error); return }
  await loadCommunity()
}
async function load() {
  await auth.initAuth()
  await loadBranding()
  accountForm.nickname = auth.profile.value?.nickname || ''
  const [{ data: branding }, { data: latestAnnouncement }] = await Promise.all([
    supabase.rpc('get_public_branding'),
    supabase.rpc('get_latest_announcement'),
  ])
  const brandingRow = Array.isArray(branding) ? branding[0] : branding
  const latestAnnouncementRow = Array.isArray(latestAnnouncement) ? latestAnnouncement[0] : latestAnnouncement
  registrationOpen.value = brandingRow?.registration_open !== false
  consoleInfo.announcementTitle = latestAnnouncementRow?.title || '最新公告'
  consoleInfo.announcement = latestAnnouncementRow?.content || brandingRow?.dashboard_announcement || consoleInfo.announcement
  consoleInfo.date = brandingRow?.home_event_date || consoleInfo.date
  consoleInfo.location = brandingRow?.home_location || consoleInfo.location
  consoleInfo.capacity = brandingRow?.home_capacity || consoleInfo.capacity
  const { data, error } = await supabase.from('hackathon_register').select('*').maybeSingle()
  if (error) errorMessage.value = readableError(error)
  registration.value = data
  if (data) syncForm(data)
  await loadTeam()
  await loadCommunity()
  await refreshCheckInCode()
  restoreDraft()
  loading.value = false
}
async function refreshCheckInCode() {
  qrCodeUrl.value = ''
  const item = registration.value
  if (!item || item.status !== 'accepted' || !item.check_in_token) return
  qrCodeUrl.value = await QRCode.toDataURL(`HACKFLOW-CHECKIN:${item.check_in_token}`, { width: 220, margin: 2, color: { dark: '#10213f', light: '#ffffff' } })
}
async function save() {
  if (saving.value || !registration.value) return
  if (registration.value.status !== 'pending') { errorMessage.value = '报名提交后不可修改。'; editing.value = false; return }
  saving.value = true; saved.value = false; errorMessage.value = ''
  const { data, error } = await supabase.from('hackathon_register').update({ ...form, portfolio_url: form.portfolio_url || null, skills: form.skills.split(/[,，]/).map(v => v.trim()).filter(Boolean) }).eq('id', registration.value?.id).select().single()
  if (error) errorMessage.value = readableError(error)
  else { registration.value = data; syncForm(data); editing.value = false; saved.value = true; setTimeout(() => saved.value = false, 2500) }
  saving.value = false
}
async function submitApplication() {
  if (saving.value) return
  errorMessage.value = ''; saved.value = false
  if (!auth.user.value) { errorMessage.value = '登录已失效，请重新登录。'; return }
  if (!registrationOpen.value && !registration.value) { errorMessage.value = '报名通道暂未开放或已关闭，暂时无法提交报名。'; return }
  for (const step of [1, 2, 3]) {
    const message = applicationStepError(step)
    if (message) { applicationStep.value = step; errorMessage.value = message; return }
  }
  saving.value = true
  const payload = {
    user_id: auth.user.value.id, full_name: form.full_name, gender: form.gender, age: form.age, education: form.education,
    phone: form.phone, applicant_email: form.applicant_email, identity_type: form.identity_type, organization: form.organization,
    participation_mode: form.participation_mode, team_name: form.team_name, skills: form.skills.split(/[,，]/).map(v => v.trim()).filter(Boolean),
    track: form.track, bio: form.bio, motivation: form.motivation, parent_name: Number(form.age) < 18 ? form.parent_name : null,
    parent_phone: Number(form.age) < 18 ? form.parent_phone : null, rules_agreed: form.rules_agreed,
    guardian_agreed: Number(form.age) < 18 ? form.guardian_agreed : false, github_url: form.github_url || null, portfolio_url: form.portfolio_url || null,
  }
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) { errorMessage.value = '登录已失效，请重新登录。'; saving.value = false; return }
  const response = await fetch('/api/application', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) })
  const result = await response.json().catch(() => ({})) as { data?: Registration; error?: string }
  if (!response.ok) errorMessage.value = result.error || '报名提交失败，请稍后重试。'
  else if (result.data) { registration.value = result.data; syncForm(result.data); await refreshCheckInCode(); activePanel.value = 'registration'; saved.value = true; setTimeout(() => saved.value = false, 2500) }
  saving.value = false
}
async function saveAccount() {
  if (saving.value) return
  errorMessage.value = ''; accountSaved.value = false
  if (!auth.user.value) return
  if (!accountForm.nickname.trim()) { errorMessage.value = '昵称不能为空。'; return }
  if (accountForm.password && accountForm.password.length < 8) { errorMessage.value = '新密码至少需要 8 位字符。'; return }
  if (accountForm.password && accountForm.password !== accountForm.confirmPassword) { errorMessage.value = '两次输入的新密码不一致。'; return }
  saving.value = true
  try {
    const { error: profileError } = await supabase.from('profiles').update({ nickname: accountForm.nickname.trim() }).eq('id', auth.user.value.id)
    if (profileError) throw profileError
    if (accountForm.password) {
      const { error: passwordError } = await supabase.auth.updateUser({ password: accountForm.password })
      if (passwordError) throw passwordError
    }
    accountForm.password = ''; accountForm.confirmPassword = ''
    await auth.loadProfile(); accountSaved.value = true
    setTimeout(() => accountSaved.value = false, 2500)
  } catch (error) { errorMessage.value = readableError(error) }
  finally { saving.value = false }
}
async function logout() { await auth.signOut(); router.push('/') }
onMounted(load)
</script>

<template>
  <main class="event-console user-console min-h-screen px-3 py-3 sm:px-5 sm:py-5">
    <div class="user-shell mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1440px] overflow-hidden">
      <aside class="user-sidebar">
        <div class="user-sidebar-top"><RouterLink to="/" class="user-brand"><span>M</span><b>{{ siteName }}</b></RouterLink><span class="user-sidebar-tag">PASSPORT</span></div>
        <p class="user-nav-label">个人空间</p>
        <nav class="user-nav"><button :class="{ active: activePanel === 'home' }" @click="activePanel = 'home'"><LayoutDashboard :size="17" /><span>控制台首页</span><ArrowLeft :size="14" class="user-nav-arrow" /></button><button :class="{ active: activePanel === 'registration' || activePanel === 'application' }" @click="activePanel = 'registration'"><FilePenLine :size="17" /><span>我的报名</span><ArrowLeft :size="14" class="user-nav-arrow" /></button><button :class="{ active: activePanel === 'team' }" @click="activePanel = 'team'"><UserPlus :size="17" /><span>我的队伍</span><ArrowLeft :size="14" class="user-nav-arrow" /></button><button :class="{ active: activePanel === 'community' }" @click="activePanel = 'community'; loadCommunity()"><MessageCircle :size="17" /><span>公共社区</span><ArrowLeft :size="14" class="user-nav-arrow" /></button><button :class="{ active: activePanel === 'profile' }" @click="activePanel = 'profile'"><UserRound :size="17" /><span>个人资料</span><ArrowLeft :size="14" class="user-nav-arrow" /></button><button :class="{ active: activePanel === 'settings' }" @click="activePanel = 'settings'"><Settings2 :size="17" /><span>账户设置</span><ArrowLeft :size="14" class="user-nav-arrow" /></button></nav>
        <div class="user-profile-card user-profile-card-below"><div class="user-avatar"><UserRound :size="19" /></div><div class="min-w-0"><p class="truncate font-semibold">{{ auth.profile.value?.nickname || '创造者' }}</p><p class="truncate text-xs text-secondary">{{ auth.profile.value?.email || 'HackFlow Passport' }}</p></div></div>
        <div class="user-sidebar-bottom"><RouterLink v-if="auth.isAdmin.value" to="/developer" class="user-admin-link"><Sparkles :size="16" />开发者后台</RouterLink><button class="user-logout" @click="logout"><LogOut :size="16" />退出登录</button></div>
      </aside>
      <section class="user-content min-w-0 flex-1">
        <header class="user-content-header"><div><p class="text-xs text-secondary">{{ siteName }} · {{ siteSubtitle }} / Passport</p><h1>{{ activePanel === 'home' ? '控制台首页' : activePanel === 'registration' ? '我的报名' : activePanel === 'application' ? '填写报名表' : activePanel === 'team' ? '我的队伍' : activePanel === 'community' ? '公共社区' : activePanel === 'profile' ? '个人资料' : '账户设置' }}</h1></div><RouterLink to="/" class="secondary-button user-home-link"><ArrowLeft :size="16" />返回前台</RouterLink></header>
        <div class="user-content-scroll">
          <div v-if="errorMessage" class="alert-error mb-5">{{ errorMessage }}</div>
          <template v-if="activePanel === 'home'">
            <div class="user-page-intro"><div><p class="section-label">WELCOME BACK</p><h2>你好，{{ auth.profile.value?.nickname || '创造者' }}</h2><p class="text-secondary">在这里查看赛事安排、报名进度和最新通知。</p></div><span class="user-page-code">HOME / HF</span></div>
            <div class="grid gap-4 lg:grid-cols-[1.1fr_.9fr]"><section class="user-status-card"><div><p class="text-sm text-secondary">报名状态</p><div class="mt-2 flex items-center gap-2 text-2xl font-semibold"><Clock3 v-if="!registration || registration.status === 'pending'" class="text-amber-500"/><CheckCircle2 v-else-if="registration.status === 'accepted'" class="text-green-500"/><XCircle v-else class="text-red-500"/>{{ registration ? statusInfo.label : registrationOpen ? '尚未报名' : '报名暂未开放' }}</div><p class="mt-2 max-w-xl text-sm text-secondary">{{ registration ? '报名已提交，审核状态更新后会在这里显示。' : registrationOpen ? '报名通道已开启，完成资料后即可进入审核。' : '请留意下方公告，等待下一次报名开放。' }}</p></div><button v-if="!registration && registrationOpen" type="button" class="primary-button self-start text-sm" @click="openApplication"><FilePenLine :size="17"/>填写报名表</button><button v-else type="button" class="secondary-button self-start text-sm" @click="activePanel = 'registration'">查看报名详情</button></section><section class="user-panel-card"><div class="panel-card-heading"><div><p class="section-label">EVENT INFO</p><h2>赛事信息</h2></div><CalendarDays :size="22"/></div><div class="space-y-4 text-sm"><div class="flex items-center gap-3"><CalendarDays :size="17" class="text-amber-500"/><div><p class="text-secondary">赛事时间</p><b>{{ consoleInfo.date }}</b></div></div><div class="flex items-center gap-3"><MapPin :size="17" class="text-amber-500"/><div><p class="text-secondary">活动地点</p><b>{{ consoleInfo.location }}</b></div></div><div class="flex items-center gap-3"><UserPlus :size="17" class="text-amber-500"/><div><p class="text-secondary">参与规模</p><b>{{ consoleInfo.capacity }}</b></div></div></div></section></div>
            <section class="user-panel-card mt-4"><div class="panel-card-heading"><div><p class="section-label">ANNOUNCEMENT</p><h2>{{ consoleInfo.announcementTitle }}</h2><p class="mt-2 text-secondary">赛事团队发布的重要信息会显示在这里。</p></div><MessageCircle :size="22"/></div><p class="whitespace-pre-wrap text-sm leading-7 text-secondary">{{ consoleInfo.announcement }}</p></section>
          </template>
          <template v-else-if="activePanel === 'registration'">
            <div class="user-page-intro"><div><p class="section-label">参赛进度</p><h2>你好，{{ auth.profile.value?.nickname || '创造者' }}</h2><p class="text-secondary">管理报名资料并查看审核进度。</p></div><span class="user-page-code">HF / 26</span></div>
            <div v-if="loading" class="user-panel-card p-10 text-center text-secondary">正在读取报名信息…</div>
            <div v-else-if="!registration && !registrationOpen" class="user-panel-card user-empty-card"><Clock3 :size="36" class="mx-auto mb-4 text-amber-500"/><h2>报名通道暂未开放</h2><p class="mt-2 text-secondary">请留意赛事公告，开放后可在这里填写完整报名资料。</p></div>
            <div v-else-if="!registration" class="user-panel-card user-empty-card"><FilePenLine :size="36" class="mx-auto mb-4"/><h2>还没有报名记录</h2><p class="mt-2 text-secondary">提交前可以反复检查内容；提交后将进入审核，不能再修改。</p><button type="button" class="primary-button mt-6" @click="openApplication">填写报名表</button></div>
            <template v-else>
              <section class="user-status-card"><div><p class="text-sm text-secondary">当前审核状态</p><div class="mt-2 flex items-center gap-2 text-2xl font-semibold"><Clock3 v-if="registration.status === 'pending'" class="text-amber-500"/><CheckCircle2 v-else-if="registration.status === 'accepted'" class="text-green-500"/><XCircle v-else class="text-red-500"/>{{ statusInfo.label }}</div><p class="mt-2 max-w-xl text-sm text-secondary">{{ registration.status === 'pending' ? '赛事团队正在认真审核你的申请，状态更新后会显示在这里。' : registration.status === 'accepted' ? '恭喜！你的报名已通过，请留意后续赛事通知。' : '本次申请暂未通过，感谢你的关注与参与。' }}</p><p v-if="registration.status === 'rejected' && registration.rejection_reason" class="mt-3 max-w-xl rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200">拒绝理由：{{ registration.rejection_reason }}</p></div><span class="user-form-state">报名提交后不可修改</span></section>
              <section v-if="registration.status === 'accepted'" class="user-checkin-card"><div><p class="section-label">CHECK-IN PASS</p><h2>现场签到二维码</h2><p class="mt-2 text-sm text-secondary">到达现场后，向工作人员出示此二维码完成签到。</p><code v-if="registration.check_in_token" class="user-checkin-code">{{ registration.check_in_token }}</code></div><div class="user-checkin-qr"><img v-if="qrCodeUrl" :src="qrCodeUrl" alt="签到二维码"/><span v-else>正在生成二维码…</span></div></section>
              <form class="user-panel-card" @submit.prevent="save"><div class="panel-card-heading"><div><p class="section-label">REGISTRATION FORM</p><h2>报名资料</h2></div><span class="user-form-state">{{ editing ? '编辑中' : '只读' }}</span></div><div class="form-grid"><label class="field-label">姓名<input v-model="form.full_name" class="field-input standalone" :disabled="!editing" required></label><label class="field-label">联系电话<input v-model="form.phone" class="field-input standalone" :disabled="!editing" required></label><label class="field-label">团队名称<input v-model="form.team_name" class="field-input standalone" :disabled="!editing"></label><label class="field-label">参赛方向<select v-model="form.track" class="field-input standalone" :disabled="!editing"><option>AI 与智能应用</option><option>未来生产力</option><option>可持续科技</option><option>开放创新</option></select></label><label class="field-label sm:col-span-2">技能关键词<input v-model="form.skills" class="field-input standalone" :disabled="!editing" required></label><label class="field-label sm:col-span-2">项目想法与个人介绍<textarea v-model="form.bio" class="field-input standalone min-h-32" :disabled="!editing" required></textarea></label><label class="field-label sm:col-span-2">作品集 / GitHub<input v-model="form.portfolio_url" class="field-input standalone" :disabled="!editing" type="url"></label></div><div v-if="saved" class="alert-success mt-5"><CheckCircle2 :size="18" />资料已保存</div><button v-if="editing" class="primary-button mt-6 w-full" :disabled="saving"><Save :size="17" />{{ saving ? '正在保存…' : '保存修改' }}</button></form>
            </template>
          </template>
          <template v-else-if="activePanel === 'application'">
            <div class="user-page-intro"><div><p class="section-label">APPLICATION</p><h2>填写报名表</h2><p class="text-secondary">所有资料都在控制台内完成；提交前可检查，提交后不可修改。</p></div><span class="user-page-code">HF / 26</span></div>
            <form class="user-panel-card" @submit.prevent="submitApplication">
              <div class="panel-card-heading"><div><h2>参赛者资料</h2><p class="text-secondary">请填写真实、完整的信息。输入内容会自动保存，刷新后可继续。</p></div><span class="user-form-state">{{ draftSaved ? '已自动保存' : '输入即保存' }}</span></div>
              <div class="application-stepper" aria-label="报名步骤"><span :class="{ active: applicationStep >= 1 }"><i>1</i><b>基本资料</b></span><span :class="{ active: applicationStep >= 2 }"><i>2</i><b>参赛信息</b></span><span :class="{ active: applicationStep >= 3 }"><i>3</i><b>想法与协议</b></span></div>
              <div v-if="applicationStep === 1"><div class="form-grid"><label class="field-label">真实姓名<input v-model.trim="form.full_name" class="field-input standalone" required maxlength="60"></label><label class="field-label">性别<select v-model="form.gender" class="field-input standalone" required><option value="" disabled>请选择</option><option>男</option><option>女</option><option>其他</option><option>不便透露</option></select></label><label class="field-label">年龄<input v-model.number="form.age" class="field-input standalone" required min="1" max="120" type="number"></label><label class="field-label">学历<select v-model="form.education" class="field-input standalone" required><option value="" disabled>请选择</option><option>高中及以下</option><option>专科</option><option>本科</option><option>硕士</option><option>博士及以上</option></select></label><label class="field-label">手机号码<input v-model.trim="form.phone" class="field-input standalone" required pattern="1[3-9]\d{9}" inputmode="numeric" maxlength="11" placeholder="请输入 11 位手机号"></label><label class="field-label">邮箱地址<input v-model.trim="form.applicant_email" class="field-input standalone" required type="email" maxlength="160" placeholder="name@example.com"></label></div></div>
              <div v-else-if="applicationStep === 2"><div class="form-grid"><label class="field-label">身份（选填）<select v-model="form.identity_type" class="field-input standalone"><option value="">请选择</option><option>在校学生</option><option>社会开发者</option></select></label><label class="field-label">学校 / 所属单位（选填）<input v-model.trim="form.organization" class="field-input standalone" maxlength="160"></label><label class="field-label">参赛模式<select v-model="form.participation_mode" class="field-input standalone" required><option>个人参赛</option><option>寻找队友</option></select></label><label class="field-label">团队名称（选填）<input v-model.trim="form.team_name" class="field-input standalone" maxlength="120"></label><label class="field-label sm:col-span-2">擅长技术栈<input v-model.trim="form.skills" class="field-input standalone" required maxlength="300" placeholder="Vue、Python、产品设计（逗号分隔）"></label></div></div>
              <div v-else><label class="field-label">个人简介（开发经历、过往项目）<textarea v-model.trim="form.bio" class="field-input standalone min-h-28" required minlength="50" maxlength="100"></textarea><small class="field-helper">{{ textLength(form.bio) }} / 100 字（需 50–100 字）</small></label><label class="field-label mt-5">参赛初衷与项目初步想法<textarea v-model.trim="form.motivation" class="field-input standalone min-h-28" required minlength="50" maxlength="100"></textarea><small class="field-helper">{{ textLength(form.motivation) }} / 100 字（需 50–100 字）</small></label><div v-if="Number(form.age) < 18" class="user-minor-card mt-5"><p class="font-semibold">未成年人监护信息</p><div class="form-grid mt-4"><label class="field-label">家长姓名<input v-model.trim="form.parent_name" class="field-input standalone" required></label><label class="field-label">家长联系手机号<input v-model.trim="form.parent_phone" class="field-input standalone" required pattern="1[3-9]\d{9}" inputmode="numeric" maxlength="11"></label></div><label class="user-check-row mt-4"><input v-model="form.guardian_agreed" type="checkbox" required><span>监护人已知晓并同意本人参加本次黑客松赛事</span></label></div><div class="form-grid mt-5"><label class="field-label">GitHub 个人主页链接（选填）<input v-model.trim="form.github_url" class="field-input standalone" type="url" placeholder="https://github.com/"></label><label class="field-label">个人作品集链接（选填）<input v-model.trim="form.portfolio_url" class="field-input standalone" type="url" placeholder="https://"></label></div><label class="user-check-row mt-5"><input v-model="form.rules_agreed" type="checkbox" required><span>已阅读赛事规则、隐私协议，同意接收赛事相关邮件短信通知</span></label></div>
              <div class="application-step-actions"><button v-if="applicationStep > 1" type="button" class="secondary-button" @click="previousApplicationStep"><ArrowLeft :size="16" />上一步</button><button v-if="applicationStep < 3" type="button" class="primary-button" @click="nextApplicationStep">下一步<ArrowLeft :size="16" class="rotate-180" /></button><button v-else class="primary-button" :disabled="saving"><Save :size="17" />{{ saving ? '正在提交…' : '提交报名' }}</button></div>
            </form>
          </template>
          <template v-else-if="activePanel === 'team'">
            <div class="user-page-intro"><div><p class="section-label">TEAM SPACE</p><h2>一起组队，做成真实的未来。</h2><p class="text-secondary">创建队伍后分享邀请码，邀请伙伴加入。</p></div><span class="user-page-code">TEAM / HF</span></div>
            <div v-if="teamNotice" class="alert-success mb-5"><CheckCircle2 :size="18" />{{ teamNotice }}</div>
            <template v-if="!team">
              <div class="team-entry-grid"><form class="user-panel-card" @submit.prevent="createTeam"><div class="panel-card-heading"><div><p class="section-label">CREATE</p><h2>创建队伍</h2><p class="mt-2 text-secondary">创建者会自动成为队长，并获得专属邀请码。</p></div><Crown :size="24" /></div><label class="field-label">队伍名称<input v-model.trim="teamName" class="field-input standalone" maxlength="50" placeholder="例如：Nova Builders"></label><button class="primary-button mt-6 w-full" :disabled="saving"><Crown :size="17" />{{ saving ? '正在创建…' : '创建并成为队长' }}</button></form><form class="user-panel-card" @submit.prevent="joinTeam"><div class="panel-card-heading"><div><p class="section-label">JOIN</p><h2>加入队伍</h2><p class="mt-2 text-secondary">向队长获取邀请码，输入后即可加入。</p></div><UserPlus :size="24" /></div><label class="field-label">队伍邀请码<input v-model.trim="inviteCode" class="field-input standalone uppercase" maxlength="8" placeholder="例如：A1B2C3D4"></label><button class="secondary-button mt-6 w-full" :disabled="saving"><UserPlus :size="17" />加入队伍</button></form></div>
            </template>
            <template v-else>
              <section class="user-status-card team-summary-card"><div><p class="section-label">{{ team.membership_role === 'pending' ? 'JOIN REQUEST PENDING' : team.leader_id === auth.user.value?.id ? 'TEAM CAPTAIN' : 'TEAM MEMBER' }}</p><h2 class="mt-2">{{ team.name }}</h2><p class="mt-2 text-sm text-secondary">{{ team.members.filter(member => member.role !== 'pending').length }} 位正式成员 · 创建于 {{ new Date(team.created_at).toLocaleDateString('zh-CN') }}</p></div><div v-if="team.membership_role === 'pending'" class="user-form-state">等待队长审核</div><div v-else class="team-invite-code"><span>邀请码</span><code>{{ team.invite_code }}</code><button v-if="team.leader_id === auth.user.value?.id" type="button" class="icon-button" title="复制邀请码" @click="copyInviteCode"><Copy :size="17" /></button></div></section>
              <section class="user-panel-card"><div class="panel-card-heading"><div><p class="section-label">MEMBERS</p><h2>队伍成员</h2><p class="mt-2 text-secondary">队长可审核申请、移除成员和转让身份。</p></div><span class="user-form-state">{{ team.members.filter(member => member.role !== 'pending').length }} 人</span></div><div class="team-member-list"><article v-for="member in team.members" :key="member.user_id" class="team-member-row"><div class="user-avatar"><Crown v-if="member.role === 'leader'" :size="18"/><UserRound v-else :size="18"/></div><div class="min-w-0 flex-1"><b class="truncate">{{ member.nickname || 'Matrix Nova 选手' }}</b><p class="truncate text-xs text-secondary">{{ member.email }}</p></div><span class="team-role" :class="member.role">{{ member.role === 'leader' ? '队长' : member.role === 'pending' ? '待审核' : '队员' }}</span><div v-if="team.leader_id === auth.user.value?.id && member.role === 'pending'" class="flex gap-2"><button class="text-xs text-green-400" @click="reviewJoinRequest(member, true)">通过</button><button class="text-xs text-red-300" @click="reviewJoinRequest(member, false)">拒绝</button></div><button v-else-if="team.leader_id === auth.user.value?.id && member.role === 'member'" class="text-xs text-red-300" @click="removeTeamMember(member)">移除</button></article></div><div v-if="team.leader_id === auth.user.value?.id && team.members.filter(item => item.role === 'member').length" class="team-transfer"><label class="field-label">转让队长<select v-model="transferTarget" class="field-input standalone"><option value="">选择一位队员</option><option v-for="member in team.members.filter(item => item.role === 'member')" :key="member.user_id" :value="member.user_id">{{ member.nickname || member.email }}</option></select></label><button type="button" class="secondary-button" :disabled="saving" @click="transferTeamLeadership">确认转让</button></div><button type="button" class="team-leave-button" :disabled="saving" @click="leaveTeam">{{ team.leader_id === auth.user.value?.id && team.members.filter(member => member.role !== 'pending').length === 1 ? '解散队伍' : '退出队伍' }}</button></section>
            </template>
          </template>
          <template v-else-if="activePanel === 'community'">
            <section class="community-chat-shell"><header class="community-chat-head"><div class="community-chat-title"><div class="community-channel-avatar"><MessageCircle :size="20"/></div><div><p>公共频道</p><span>{{ communityPosts.length }} 条消息 · 所有 Matrix Nova 选手可见</span></div></div><button class="icon-button" title="刷新消息" @click="loadCommunity"><MessageCircle :size="17"/></button></header><div ref="communityChatRef" class="community-chat-messages"><div class="community-notice">欢迎来到 Matrix Nova 公共频道，请友善交流、寻找队友并分享灵感。</div><div v-if="communityLoading" class="community-chat-empty">正在连接公共频道…</div><div v-else-if="!communityPosts.length" class="community-chat-empty">频道还没有消息，和大家打个招呼吧。</div><article v-for="post in communityPosts" :key="post.id" class="community-message" :class="{ mine: post.author_id === auth.user.value?.id }"><div v-if="post.author_id !== auth.user.value?.id" class="community-message-avatar">{{ (post.nickname || 'M').slice(0, 1) }}</div><div class="community-message-body"><div class="community-message-meta"><b>{{ post.author_id === auth.user.value?.id ? '我' : (post.nickname || 'Matrix Nova 选手') }}</b><span>{{ new Date(post.created_at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span></div><div v-if="post.reply_to" class="community-reply-quote">回复 {{ post.reply_nickname || '一条消息' }}：{{ post.reply_content || '该消息已撤回或删除' }}</div><p v-if="post.admin_deleted_at" class="community-message-state">管理员删除了一条消息</p><p v-else-if="post.retracted_at" class="community-message-state">对方撤回了一条消息</p><p v-else>{{ post.content }}</p><button v-if="!post.retracted_at && !post.admin_deleted_at" class="community-reply-button" @click="replyToPost = post">引用回复</button></div><button v-if="!post.retracted_at && !post.admin_deleted_at && (post.author_id === auth.user.value?.id || auth.isAdmin.value)" class="community-delete" :title="post.author_id === auth.user.value?.id ? '撤回消息' : '管理员删除消息'" @click="deleteCommunityPost(post)"><Trash2 :size="14"/></button></article></div><form class="community-chat-input" @submit.prevent="publishCommunityPost"><div v-if="replyToPost" class="community-replying">正在引用 {{ replyToPost.author_id === auth.user.value?.id ? '自己' : replyToPost.nickname }}：{{ replyToPost.content }}<button type="button" @click="replyToPost = null">取消</button></div><textarea v-model.trim="communityDraft" maxlength="100" placeholder="输入消息，按发送与大家交流…" @keydown.enter.exact.prevent="publishCommunityPost"></textarea><div><small>{{ communityDraft.length }} / 100</small><button class="primary-button" :disabled="saving || !communityDraft.trim()">发送</button></div></form></section>
          </template>
          <template v-else-if="activePanel === 'profile'">
            <div class="user-page-intro"><div><p class="section-label">PROFILE</p><h2>个人资料</h2><p class="text-secondary">更新你的公开昵称与账号信息。</p></div></div>
            <form class="user-panel-card user-account-form" @submit.prevent="saveAccount"><div class="panel-card-heading"><div><h2>账号身份</h2><p class="text-secondary">这些信息用于赛事联系与个人控制台展示。</p></div><ShieldCheck :size="22" /></div><label class="field-label">登录邮箱<input :value="auth.profile.value?.email" class="field-input standalone" disabled></label><label class="field-label">昵称<input v-model="accountForm.nickname" class="field-input standalone" maxlength="40" required></label><div class="user-account-meta"><span>角色</span><b>{{ auth.profile.value?.role === 'admin' ? '管理员' : '普通用户' }}</b><span>账号状态</span><b>{{ auth.profile.value?.status === 'active' ? '正常' : '已封禁' }}</b></div><div v-if="accountSaved" class="alert-success"><CheckCircle2 :size="18" />资料已保存</div><button class="primary-button mt-6" :disabled="saving"><Save :size="17" />{{ saving ? '正在保存…' : '保存资料' }}</button></form>
          </template>
          <template v-else>
            <div class="user-page-intro"><div><p class="section-label">SETTINGS</p><h2>账户设置</h2><p class="text-secondary">管理登录安全与偏好设置。</p></div></div>
            <form class="user-panel-card user-account-form" @submit.prevent="saveAccount"><div class="panel-card-heading"><div><h2>登录安全</h2><p class="text-secondary">修改密码后，其他设备上的旧会话可能需要重新登录。</p></div><Settings2 :size="22" /></div><label class="field-label">新密码<input v-model="accountForm.password" class="field-input standalone" type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位字符"></label><label class="field-label">确认新密码<input v-model="accountForm.confirmPassword" class="field-input standalone" type="password" minlength="8" autocomplete="new-password" placeholder="再次输入新密码"></label><div class="user-setting-row"><div><b>邮件通知</b><p class="text-secondary">报名状态更新后接收赛事通知</p></div><span class="user-setting-on">已开启</span></div><div v-if="accountSaved" class="alert-success"><CheckCircle2 :size="18" />设置已保存</div><button class="primary-button mt-6" :disabled="saving"><Save :size="17" />{{ saving ? '正在保存…' : '保存设置' }}</button></form>
          </template>
        </div>
      </section>
    </div>
    <nav class="user-mobile-nav" aria-label="移动端导航"><button :class="{ active: activePanel === 'home' }" @click="activePanel = 'home'"><LayoutDashboard :size="18"/><span>首页</span></button><button :class="{ active: activePanel === 'registration' || activePanel === 'application' }" @click="activePanel = 'registration'"><FilePenLine :size="18"/><span>报名</span></button><button :class="{ active: activePanel === 'team' }" @click="activePanel = 'team'"><UserPlus :size="18"/><span>队伍</span></button><button :class="{ active: activePanel === 'community' }" @click="activePanel = 'community'; loadCommunity()"><MessageCircle :size="18"/><span>社区</span></button><button :class="{ active: activePanel === 'profile' }" @click="activePanel = 'profile'"><UserRound :size="18"/><span>资料</span></button><button :class="{ active: activePanel === 'settings' }" @click="activePanel = 'settings'"><Settings2 :size="18"/><span>设置</span></button><RouterLink v-if="auth.isAdmin.value" to="/developer"><Sparkles :size="18"/><span>后台</span></RouterLink><button @click="logout"><LogOut :size="18"/><span>退出</span></button></nav>
  </main>
</template>
