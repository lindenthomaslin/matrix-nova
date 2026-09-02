<script setup lang="ts">
import { ArrowRight, LockKeyhole, ShieldAlert } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isSupabaseConfigured, readableError, supabase } from '../lib/supabase'
import { useBranding } from '../lib/branding'
import CaptchaChallenge from '../components/CaptchaChallenge.vue'
import { useAuth } from '../composables/useAuth'
import { getClientSecurityId } from '../lib/security'

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const turnstileToken = ref('')
const captchaKey = ref(0)
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const { heroImage, siteName, loadBranding } = useBranding()

function resetCaptcha() {
  turnstileToken.value = ''
  if (turnstileSiteKey) captchaKey.value += 1
}

onMounted(async () => {
  await auth.initAuth()
  await auth.ensureSessionValid()
  if (auth.isLoggedIn.value) { await router.replace(auth.isAdmin.value ? '/developer' : '/dashboard'); return }
  await loadBranding()
})

async function login() {
  if (loading.value) return
  errorMessage.value = ''
  if (!isSupabaseConfigured) { errorMessage.value = 'Supabase 尚未配置，请先完成部署配置。'; return }
  if (turnstileSiteKey && !turnstileToken.value) { errorMessage.value = '请先完成 Cloudflare 人机验证。'; return }
  loading.value = true
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Client-ID': getClientSecurityId() },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        turnstileToken: turnstileToken.value || undefined,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      if (res.status === 403) throw new Error('人机验证未通过，请重试。')
      throw new Error(err.error || '登录失败，请重试。')
    }
    const session = await res.json() as { access_token: string; refresh_token: string }
    const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    if (error) throw error
    await auth.loadProfile()
    const account = auth.profile.value
    const blockedMessage = auth.consumeBlockedMessage()
    if (blockedMessage || account?.status === 'banned') {
      await supabase.auth.signOut()
      resetCaptcha()
      errorMessage.value = blockedMessage || '你的账号已被封禁，请联系管理员。'
      return
    }
    if (!account) throw new Error('账号状态读取失败，请稍后重试。')
    const destination = typeof route.query.redirect === 'string' ? route.query.redirect : account?.role === 'admin' ? '/developer' : '/dashboard'
    await router.push(destination)
  } catch (error) {
    resetCaptcha()
    errorMessage.value = readableError(error)
  }
  finally { loading.value = false }
}
</script>

<template>
  <main class="hack-auth-page">
    <section class="hack-auth-visual">
      <RouterLink to="/" class="hack-auth-brand"><span>M</span>{{ siteName }}</RouterLink>
      <div class="hack-auth-poster" :style="{ backgroundImage: `url(${heroImage})` }"><div class="hack-auth-poster-shade" /><div class="hack-auth-poster-copy"><p>{{ siteName }} 2026</p><h2>让好想法<br>真正发生。</h2><span>48 小时 · 一起把灵感做成作品</span></div></div>
      <div class="hack-auth-visual-foot">{{ siteName }} 2026 · 创新者黑客松</div>
    </section>
    <section class="hack-auth-panel">
      <div class="hack-auth-inner">
        <div class="hack-auth-kicker">登录注册</div>
        <div class="hack-auth-heading"><div class="hack-auth-icon"><LockKeyhole :size="19" /></div><h1>欢迎回到 {{ siteName }}</h1><p>登录你的参赛账号，继续推进你的想法。</p></div>
        <form class="hack-auth-form" @submit.prevent="login">
          <label class="hack-auth-label"><span><b>*</b>邮箱</span><input v-model.trim="email" class="hack-auth-input" type="email" maxlength="160" autocomplete="email" required placeholder="welcome@hackflow.cn"></label>
          <label class="hack-auth-label"><span><b>*</b>密码</span><input v-model="password" class="hack-auth-input" type="password" maxlength="128" autocomplete="current-password" required placeholder="输入你的密码"></label>
          <CaptchaChallenge v-if="turnstileSiteKey" :key="captchaKey" :site-key="turnstileSiteKey" theme="auto" @verified="turnstileToken = $event" @expired="turnstileToken = ''" @error="turnstileToken = ''" />
          <div v-if="errorMessage" class="hack-auth-alert"><ShieldAlert :size="17" />{{ errorMessage }}</div>
          <button class="hack-auth-submit" :disabled="loading">{{ loading ? '正在登录…' : '登录' }}<ArrowRight v-if="!loading" :size="18" /></button>
        </form>
        <RouterLink to="/register" class="hack-auth-switch"><span>还没有 {{ siteName }} Passport？</span><strong>立即注册 <ArrowRight :size="15" /></strong></RouterLink>
        <p class="hack-auth-legal">继续即表示你已同意赛事报名规则与隐私说明。</p>
      </div>
    </section>
  </main>
</template>
