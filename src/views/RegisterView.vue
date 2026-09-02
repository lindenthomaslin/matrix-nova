<script setup lang="ts">
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert, UserRoundPlus } from '@lucide/vue'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { isSupabaseConfigured, readableError, supabase } from '../lib/supabase'
import { useBranding } from '../lib/branding'
import CaptchaChallenge from '../components/CaptchaChallenge.vue'
import { getClientSecurityId } from '../lib/security'

const auth = useAuth()
const router = useRouter()
const loading = ref(false)
const message = ref('')
const verificationPending = ref(false)
const verificationCode = ref('')
const verificationLoading = ref(false)
const resendLoading = ref(false)
const errorMessage = ref('')
const turnstileToken = ref('')
const captchaKey = ref(0)
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const registerStep = ref(1)
const formEl = ref<HTMLFormElement | null>(null)
const agreementSeconds = ref(10)
const agreementUnlocked = ref(false)
const agreementAccepted = ref(false)
const agreementModal = ref<'rules' | 'privacy' | null>(null)
const agreementRead = reactive({ rules: false, privacy: false })
const agreementContent = reactive({ rules: '请遵守赛事规则，提交真实、准确的报名信息，并尊重其他参赛者。', privacy: '我们仅会使用报名信息进行资格审核、赛事联络与活动组织，不会将其用于无关用途。' })
let agreementTimer: number | undefined
const form = reactive({ email: '', password: '', confirm_password: '', nickname: '', full_name: '', gender: '', age: null as number | null, education: '', phone: '', applicant_email: '', identity_type: '', organization: '', participation_mode: '个人参赛', team_name: '', skills: '', track: 'AI 与智能应用', bio: '', motivation: '', parent_name: '', parent_phone: '', rules_agreed: false, guardian_agreed: false, github_url: '', portfolio_url: '' })
const signedIn = computed(() => auth.isLoggedIn.value)
const isApplicationRoute = computed(() => router.currentRoute.value.path === '/apply')
const stepTotal = computed(() => isApplicationRoute.value ? 2 : 1)
const { heroImage, siteName, loadBranding } = useBranding()

function resetCaptcha() {
  turnstileToken.value = ''
  if (turnstileSiteKey) captchaKey.value += 1
}

onMounted(async () => {
  await auth.initAuth()
  await auth.ensureSessionValid()
  if (!isApplicationRoute.value && auth.isLoggedIn.value) { await router.replace(auth.isAdmin.value ? '/developer' : '/dashboard'); return }
  if (isApplicationRoute.value && !auth.isLoggedIn.value) { await router.replace('/login'); return }
  await loadBranding()
  const { data: publicContent } = await supabase.rpc('get_public_branding')
  const publicRow = Array.isArray(publicContent) ? publicContent[0] : publicContent
  if (publicRow?.rules_content) agreementContent.rules = publicRow.rules_content
  if (publicRow?.privacy_content) agreementContent.privacy = publicRow.privacy_content
  if (!form.applicant_email && auth.profile.value?.email) form.applicant_email = auth.profile.value.email
  const draft = sessionStorage.getItem('hackflow-register-draft')
  if (draft) Object.assign(form, JSON.parse(draft))
  agreementTimer = window.setInterval(() => { if (agreementSeconds.value > 0) agreementSeconds.value -= 1; else if (agreementTimer) window.clearInterval(agreementTimer) }, 1000)
})
onUnmounted(() => { if (agreementTimer) window.clearInterval(agreementTimer) })

async function submit() {
  if (loading.value) return
  errorMessage.value = ''; message.value = ''
  if (!isSupabaseConfigured) { errorMessage.value = 'Supabase 尚未配置，表单暂时无法提交。'; return }
  if (turnstileSiteKey && !turnstileToken.value) { errorMessage.value = '请先完成 Cloudflare 人机验证。'; return }
  if (!signedIn.value && form.password !== form.confirm_password) {
    errorMessage.value = '两次输入的密码不一致，请重新确认。'
    return
  }
  if ((!signedIn.value && (!form.email || !form.password || !form.confirm_password || !form.full_name || !form.phone)) || (signedIn.value && (!form.full_name || !form.gender || !form.age || !form.education || !form.phone || !(form.applicant_email || form.email) || !form.identity_type || !form.organization || !form.participation_mode || !form.skills || !form.bio || !form.motivation || !form.rules_agreed || (Number(form.age) < 18 && (!form.parent_name || !form.parent_phone || !form.guardian_agreed))))) {
    errorMessage.value = '请先完成所有必填信息。'
    return
  }
  loading.value = true
  try {
    let userId = auth.user.value?.id
    if (!userId) {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Client-ID': getClientSecurityId() },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          turnstileToken: turnstileToken.value || undefined,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            data: { nickname: form.full_name, phone: form.phone, full_name: form.full_name },
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        if (res.status === 403) throw new Error('人机验证未通过，请重试。')
        throw new Error(err.error || '注册失败，请稍后再试。')
      }
      sessionStorage.setItem('hackflow-register-draft', JSON.stringify({ email: form.email, full_name: form.full_name, phone: form.phone }))
      verificationPending.value = true
      message.value = '验证码已发送到你的邮箱，请查收后输入。'
      return
    }
    const { error } = await supabase.from('hackathon_register').upsert({
      user_id: userId, full_name: form.full_name, gender: form.gender, age: form.age, education: form.education,
      phone: form.phone, applicant_email: form.applicant_email || form.email, identity_type: form.identity_type,
      organization: form.organization, participation_mode: form.participation_mode, team_name: form.team_name,
      skills: form.skills.split(/[,，]/).map(v => v.trim()).filter(Boolean), track: form.track, bio: form.bio, motivation: form.motivation,
      parent_name: Number(form.age) < 18 ? form.parent_name : null, parent_phone: Number(form.age) < 18 ? form.parent_phone : null,
      rules_agreed: form.rules_agreed, guardian_agreed: Number(form.age) < 18 ? form.guardian_agreed : false,
      github_url: form.github_url || null, portfolio_url: form.portfolio_url || null,
    }, { onConflict: 'user_id' })
    if (error) throw error
    sessionStorage.removeItem('hackflow-register-draft')
    await router.push('/dashboard')
  } catch (error) {
    resetCaptcha()
    errorMessage.value = readableError(error)
  }
  finally { loading.value = false }
}

async function verifyEmail() {
  if (verificationLoading.value) return
  if (!verificationCode.value.trim()) { errorMessage.value = '请输入邮箱验证码。'; return }
  verificationLoading.value = true; errorMessage.value = ''
  try {
    const { error } = await supabase.auth.verifyOtp({ email: form.email, token: verificationCode.value.trim(), type: 'signup' })
    if (error) throw error
    verificationPending.value = false
    sessionStorage.removeItem('hackflow-register-draft')
    message.value = '邮箱验证成功，请登录你的 HackFlow 账户。'
    // Email verification creates a temporary session. End it here so the
    // user follows the intended flow: verify → login → open the application form.
    await supabase.auth.signOut()
    await router.push('/login')
  } catch (error) { errorMessage.value = readableError(error) }
  finally { verificationLoading.value = false }
}

async function resendVerification() {
  if (resendLoading.value) return
  resendLoading.value = true
  errorMessage.value = ''; message.value = ''
  const { error } = await supabase.auth.resend({ type: 'signup', email: form.email, options: { emailRedirectTo: `${window.location.origin}/login` } })
  if (error) errorMessage.value = readableError(error); else message.value = '验证邮件已重新发送，请检查收件箱和垃圾邮件。'
  resendLoading.value = false
}

function validateCurrentStep() {
  const sections = Array.from(formEl.value?.querySelectorAll<HTMLElement>('[data-register-step]') || []).filter(section => section.offsetParent !== null)
  const invalid = sections.flatMap(section => Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))).find(field => !field.checkValidity())
  if (!invalid) return true
  invalid.reportValidity(); return false
}
function nextStep() { if (validateCurrentStep() && registerStep.value < stepTotal.value) registerStep.value += 1 }
function previousStep() { if (registerStep.value > 1) registerStep.value -= 1 }
function openAgreement(type: 'rules' | 'privacy') { agreementModal.value = type }
function closeAgreement() { if (agreementModal.value) agreementRead[agreementModal.value] = true; agreementModal.value = null }
function unlockAgreement() { if (agreementSeconds.value === 0 && agreementRead.rules && agreementRead.privacy && agreementAccepted.value) { form.rules_agreed = true; agreementUnlocked.value = true } }
</script>

<template>
  <main :class="['hack-auth-page hack-auth-register-page', { 'hack-auth-step-page': registerStep > 1 }]">
    <section class="hack-auth-visual">
      <RouterLink to="/" class="hack-auth-brand"><span>M</span>{{ siteName }}</RouterLink>
      <div class="hack-auth-poster" :style="{ backgroundImage: `url(${heroImage})` }"><div class="hack-auth-poster-shade" /><div class="hack-auth-poster-copy"><p><UserRoundPlus :size="14" /> 参赛申请</p><h2>报名即是<br>创造的开始。</h2><span>把你的灵感带进现场，也带进未来。</span></div></div>
      <div class="hack-auth-visual-foot">上海 · 西岸　/　10.16 — 10.18</div>
    </section>
    <section class="hack-auth-panel">
      <form ref="formEl" class="hack-auth-inner hack-auth-register-form" @submit.prevent="submit">
        <div v-if="!isApplicationRoute && !agreementUnlocked" class="hack-auth-agreement-gate"><div class="hack-auth-gate-card"><div class="hack-auth-icon"><UserRoundPlus :size="19" /></div><p class="hack-auth-gate-kicker">{{ siteName }} PASSPORT</p><h1>注册你的 {{ siteName }} 账户</h1><p class="hack-auth-gate-copy">请花一点时间阅读赛事规则与隐私协议，完成后即可继续注册。</p><div class="hack-auth-gate-progress"><span :style="{ width: `${(10 - agreementSeconds) * 10}%` }" /></div><p class="hack-auth-gate-count">{{ agreementSeconds > 0 ? `请阅读协议，${agreementSeconds} 秒后可继续` : '可以继续了' }}</p><div class="hack-auth-agreement-links"><button type="button" :class="{ read: agreementRead.rules }" @click="openAgreement('rules')">{{ agreementRead.rules ? '✓ 已阅读赛事规则' : '阅读赛事规则' }}<ArrowRight :size="15" /></button><button type="button" :class="{ read: agreementRead.privacy }" @click="openAgreement('privacy')">{{ agreementRead.privacy ? '✓ 已阅读隐私协议' : '阅读隐私协议' }}<ArrowRight :size="15" /></button></div><label class="hack-auth-check hack-auth-gate-check"><input v-model="agreementAccepted" type="checkbox" :disabled="agreementSeconds > 0 || !agreementRead.rules || !agreementRead.privacy"><span>我已阅读并同意赛事规则与隐私协议，并同意接收赛事相关通知</span></label><button type="button" class="hack-auth-submit" :disabled="agreementSeconds > 0 || !agreementRead.rules || !agreementRead.privacy || !agreementAccepted" @click="unlockAgreement">继续注册<ArrowRight :size="18" /></button></div><div v-if="agreementModal" class="hack-auth-agreement-modal" @click.self="closeAgreement"><article><div class="hack-auth-modal-head"><h2>{{ agreementModal === 'rules' ? '赛事规则' : '隐私协议' }}</h2><button type="button" @click="closeAgreement">关闭</button></div><div class="hack-auth-modal-body">{{ agreementModal === 'rules' ? agreementContent.rules : agreementContent.privacy }}</div><button type="button" class="hack-auth-submit" @click="closeAgreement">我已阅读</button></article></div></div>
        <div class="hack-auth-kicker-row"><div class="hack-auth-kicker">{{ isApplicationRoute ? '填写报名表' : '账号注册' }}</div><RouterLink to="/login" class="hack-auth-back-login"><ArrowLeft :size="14" />返回登录</RouterLink></div>
        <div class="hack-auth-heading"><div class="hack-auth-icon"><UserRoundPlus :size="19" /></div><h1>{{ isApplicationRoute ? '完成你的参赛申请' : '创建你的 HackFlow Passport' }}</h1><p>{{ isApplicationRoute ? '补充参赛资料，提交后将进入赛事审核。' : '先完成账号注册，验证邮箱后再登录填写报名表。' }}</p></div>
        <div v-if="verificationPending" class="hack-auth-section hack-auth-verification-card"><h2>验证你的邮箱</h2><p class="hack-auth-field-note">我们已向 <strong>{{ form.email }}</strong> 发送 8 位验证码，请输入邮件中的验证码完成注册。</p><label class="hack-auth-label"><span><b>*</b>邮箱验证码</span><input v-model.trim="verificationCode" class="hack-auth-input" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="输入 8 位验证码"></label><button type="button" class="hack-auth-submit" :disabled="verificationLoading" @click="verifyEmail">{{ verificationLoading ? '验证中…' : '验证邮箱' }}<ArrowRight :size="18" /></button><button type="button" class="hack-auth-resend" :disabled="resendLoading" @click="resendVerification">{{ resendLoading ? '发送中…' : '没有收到？重新发送验证邮件' }}</button></div>
        <div class="hack-auth-progress" aria-label="报名进度"><span v-for="item in stepTotal" :key="item" :class="{ active: item <= registerStep }"><i>{{ item }}</i><b>{{ isApplicationRoute ? (item === 1 ? '基本资料' : '报名表') : '账号注册' }}</b></span></div>
        <section v-if="!verificationPending && !signedIn && registerStep === 1" data-register-step class="hack-auth-section"><h2>账号信息</h2><div class="hack-auth-grid"><label class="hack-auth-label"><span><b>*</b>邮箱</span><input v-model.trim="form.email" class="hack-auth-input" required maxlength="160" type="email" autocomplete="email" placeholder="welcome@hackflow.cn"></label><label class="hack-auth-label"><span><b>*</b>真实姓名</span><input v-model.trim="form.full_name" class="hack-auth-input" required maxlength="60" placeholder="你的姓名"></label><label class="hack-auth-label"><span><b>*</b>联系电话</span><input v-model.trim="form.phone" class="hack-auth-input" required maxlength="30" placeholder="手机号"></label><label class="hack-auth-label hack-auth-span-2"><span><b>*</b>密码</span><input v-model="form.password" class="hack-auth-input" required minlength="8" maxlength="128" type="password" autocomplete="new-password" placeholder="至少 8 位字符"></label></div></section>
        <section v-if="isApplicationRoute && registerStep === 1" data-register-step class="hack-auth-section"><h2>基本信息</h2><div class="hack-auth-grid"><label class="hack-auth-label"><span><b>*</b>真实姓名</span><input v-model.trim="form.full_name" class="hack-auth-input" required maxlength="60" placeholder="你的姓名"></label><label class="hack-auth-label"><span><b>*</b>联系电话</span><input v-model.trim="form.phone" class="hack-auth-input" required maxlength="30" placeholder="手机号或其他联系方式"></label><label class="hack-auth-label"><span>团队名称（选填）</span><input v-model.trim="form.team_name" class="hack-auth-input" maxlength="80" placeholder="个人参赛可留空"></label><label class="hack-auth-label"><span><b>*</b>参赛方向</span><select v-model="form.track" class="hack-auth-input"><option>AI 与智能应用</option><option>未来生产力</option><option>可持续科技</option><option>开放创新</option></select></label></div></section>
        <section v-if="isApplicationRoute && registerStep === 2" data-register-step class="hack-auth-section"><h2>关于你的想法</h2><div class="space-y-4"><label class="hack-auth-label"><span><b>*</b>技能关键词</span><input v-model="form.skills" class="hack-auth-input" required maxlength="300" placeholder="Vue, Python, 产品设计（逗号分隔）"></label><label class="hack-auth-label"><span><b>*</b>项目想法与个人介绍</span><textarea v-model="form.bio" class="hack-auth-input hack-auth-textarea" required maxlength="100" placeholder="你想解决的问题、已有构思，以及你能为团队带来什么"></textarea></label><label class="hack-auth-label"><span>作品集 / GitHub（选填）</span><input v-model.trim="form.portfolio_url" class="hack-auth-input" type="url" maxlength="2048" placeholder="https://"></label></div></section>
        <section v-if="isApplicationRoute && registerStep === 2" data-register-step class="hack-auth-section"><h2>补充资料与协议</h2><div class="hack-auth-grid"><label class="hack-auth-label"><span><b>*</b>性别</span><select v-model="form.gender" class="hack-auth-input" required><option value="" disabled>请选择</option><option>男</option><option>女</option><option>其他</option><option>不便透露</option></select></label><label class="hack-auth-label"><span><b>*</b>年龄</span><input v-model.number="form.age" class="hack-auth-input" required min="1" max="120" type="number" placeholder="周岁"></label><label class="hack-auth-label"><span><b>*</b>学历</span><select v-model="form.education" class="hack-auth-input" required><option value="" disabled>请选择</option><option>高中及以下</option><option>专科</option><option>本科</option><option>硕士</option><option>博士及以上</option></select></label><label class="hack-auth-label"><span><b>*</b>邮箱地址</span><input v-model.trim="form.applicant_email" class="hack-auth-input" required maxlength="160" type="email" placeholder="用于接收赛事通知"></label><label class="hack-auth-label"><span><b>*</b>身份</span><select v-model="form.identity_type" class="hack-auth-input" required><option value="" disabled>请选择</option><option>在校学生</option><option>社会开发者</option></select></label><label class="hack-auth-label"><span><b>*</b>学校 / 所属单位</span><input v-model.trim="form.organization" class="hack-auth-input" required maxlength="160" placeholder="学校或公司名称"></label><label class="hack-auth-label"><span><b>*</b>参赛模式</span><select v-model="form.participation_mode" class="hack-auth-input" required><option>个人参赛</option><option>寻找队友</option></select></label></div><div v-if="Number(form.age) < 18" class="hack-auth-minor"><p>未成年人监护信息</p><div class="hack-auth-grid"><label class="hack-auth-label"><span><b>*</b>家长姓名</span><input v-model.trim="form.parent_name" class="hack-auth-input" required maxlength="80" placeholder="家长姓名"></label><label class="hack-auth-label"><span><b>*</b>家长联系手机号</span><input v-model.trim="form.parent_phone" class="hack-auth-input" required maxlength="30" placeholder="家长手机号"></label></div><label class="hack-auth-check"><input v-model="form.guardian_agreed" type="checkbox" required><span>监护人已知晓并同意本人参加本次黑客松赛事</span></label></div><label class="hack-auth-check"><input v-model="form.rules_agreed" type="checkbox" required><span>已阅读赛事规则、隐私协议，同意接收赛事相关邮件短信通知</span></label><label class="hack-auth-label"><span><b>*</b>参赛初衷与项目初步想法</span><textarea v-model="form.motivation" class="hack-auth-input hack-auth-textarea" required maxlength="100" placeholder="你为什么参加本次黑客松，想解决什么问题"></textarea></label><label class="hack-auth-label"><span>GitHub 个人主页链接（选填）</span><input v-model.trim="form.github_url" class="hack-auth-input" type="url" maxlength="2048" placeholder="https://github.com/"></label></section>
        <section v-if="!verificationPending && !signedIn && registerStep === 1" data-register-step class="hack-auth-section hack-auth-confirm-section"><label class="hack-auth-label"><span><b>*</b>确认密码</span><input v-model="form.confirm_password" class="hack-auth-input" required minlength="8" maxlength="128" type="password" autocomplete="new-password" placeholder="再次输入密码"></label><p class="hack-auth-field-note">提交注册后，我们会向你的邮箱发送 8 位验证码。</p></section>
        <CaptchaChallenge v-if="!verificationPending && registerStep === stepTotal && turnstileSiteKey" :key="captchaKey" :site-key="turnstileSiteKey" theme="auto" @verified="turnstileToken = $event" @expired="turnstileToken = ''" @error="turnstileToken = ''" />
        <div v-if="errorMessage" class="hack-auth-alert"><ShieldAlert :size="17" />{{ errorMessage }}</div><div v-if="message" class="hack-auth-success"><CheckCircle2 :size="17" />{{ message }}</div>
        <div v-if="!verificationPending" class="hack-auth-step-actions"><button v-if="registerStep > 1" type="button" class="hack-auth-step-back" @click="previousStep">上一步</button><button v-if="registerStep < stepTotal" type="button" class="hack-auth-submit" @click="nextStep">下一步<ArrowRight :size="18" /></button><button v-else class="hack-auth-submit" :disabled="loading">{{ loading ? '正在提交…' : isApplicationRoute ? '提交报名' : '创建账号' }}<ArrowRight v-if="!loading" :size="18" /></button></div>
        <RouterLink v-if="!isApplicationRoute && registerStep === stepTotal" to="/login" class="hack-auth-switch"><span>已经拥有 HackFlow Passport？</span><strong>前往登录 <ArrowRight :size="15" /></strong></RouterLink>
        <p v-if="!isApplicationRoute && registerStep === stepTotal" class="hack-auth-legal">继续即表示你同意赛事组织方为报名审核与赛事联络处理以上信息。</p>
      </form>
    </section>
  </main>
</template>
