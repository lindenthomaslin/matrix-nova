<script setup lang="ts">
import { ArrowRight, CalendarDays, FilePenLine, Info, LayoutDashboard, LogIn, Menu, MessageCircle, Moon, ShieldCheck, Sun, UserPlus, Users, X } from '@lucide/vue'
import { RouterLink, RouterView } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from './composables/useAuth'
import { useBranding } from './lib/branding'
import { trackPageView } from './lib/analytics'
import { getClientSecurityId } from './lib/security'

const dark = ref(false)
const route = useRoute()
const auth = useAuth()
const { siteIcon, siteName, siteSubtitle, loadBranding } = useBranding()
const showPublicNav = computed(() => ['/', '/event', '/team', '/about'].includes(route.path))
const mobileMenuOpen = ref(false)
const isWechat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)
type WechatBridgeWindow = Window & { WeixinJSBridge?: { call: (command: string) => unknown } }
function syncWechatViewport() {
  if (!isWechat) return
  const visualHeight = window.visualViewport?.height || window.innerHeight
  const browserGap = Math.max(0, window.innerHeight - visualHeight)
  const bottom = Math.max(52, Math.min(96, Math.round(browserGap)))
  document.documentElement.style.setProperty('--wechat-toolbar-bottom', `${bottom}px`)
  document.documentElement.style.setProperty('--wechat-viewport-height', `${Math.round(visualHeight)}px`)
}
if (isWechat) {
  document.documentElement.classList.add('wechat')
  syncWechatViewport()
  window.addEventListener('resize', syncWechatViewport, { passive: true })
  window.visualViewport?.addEventListener('resize', syncWechatViewport, { passive: true })
}
function hideWechatToolbar(path: string) {
  if (!isWechat || (path !== '/dashboard' && path !== '/developer')) return
  const invoke = () => (window as WechatBridgeWindow).WeixinJSBridge?.call('hideToolbar')
  invoke()
  document.addEventListener('WeixinJSBridgeReady', invoke, { once: true })
  // The bridge can become available after a SPA navigation, so retry briefly.
  window.setTimeout(invoke, 80)
  window.setTimeout(invoke, 450)
}
watch(() => route.path, hideWechatToolbar, { immediate: true })
watch(() => route.path, () => { mobileMenuOpen.value = false })
watch(() => route.fullPath, (path) => { void trackPageView(path, auth.user.value?.id) }, { immediate: true })
onMounted(async () => {
  getClientSecurityId()
  dark.value = localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark.value)
  await auth.initAuth()
  await loadBranding()
  hideWechatToolbar(route.path)
})
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  localStorage.setItem('theme', dark.value ? 'dark' : 'light')
}
</script>

<template>
  <div class="min-h-screen">
    <header v-if="showPublicNav" class="event-public-header">
      <nav class="event-public-nav">
        <RouterLink to="/" class="flex items-center gap-2 font-semibold tracking-tight">
          <img v-if="siteIcon" :src="siteIcon" class="h-7 w-7 rounded-lg object-cover" alt="网站图标"><span v-else class="grid h-7 w-7 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">H</span>
          <span>{{ siteName }}</span><small v-if="siteSubtitle" class="event-site-subtitle">{{ siteSubtitle }}</small>
        </RouterLink>
        <div class="event-public-page-links">
          <RouterLink to="/event" class="event-public-link">赛事</RouterLink><RouterLink to="/team" class="event-public-link">团队介绍</RouterLink><RouterLink to="/about" class="event-public-link">关于我们</RouterLink>
        </div><div class="event-public-actions">
          <RouterLink v-if="!auth.isLoggedIn.value" to="/login" class="event-public-link">登录</RouterLink>
          <RouterLink v-if="auth.isAdmin.value" to="/developer" class="event-public-link event-public-admin-link"><ShieldCheck :size="15" />进入后台</RouterLink>
          <button class="event-theme-button" aria-label="切换外观" @click="toggleTheme">
            <Sun v-if="dark" :size="17" />
            <Moon v-else :size="17" />
          </button>
          <RouterLink :to="auth.isLoggedIn.value ? '/dashboard' : '/register'" class="event-public-cta">{{ auth.isLoggedIn.value ? '进入控制台' : '立即报名' }}</RouterLink>
          <button class="event-mobile-menu-button" type="button" :aria-expanded="mobileMenuOpen" aria-controls="event-mobile-menu" :aria-label="mobileMenuOpen ? '收起导航菜单' : '展开导航菜单'" @click="mobileMenuOpen = !mobileMenuOpen">
            <Menu v-if="!mobileMenuOpen" :size="18" />
            <X v-else :size="18" />
          </button>
        </div>
        <Transition name="event-menu">
          <div v-if="mobileMenuOpen" id="event-mobile-menu" class="event-mobile-menu" role="menu" aria-label="页面导航">
            <RouterLink to="/event" class="event-public-link" role="menuitem" @click="mobileMenuOpen = false"><CalendarDays :size="17" />赛事</RouterLink>
            <RouterLink to="/team" class="event-public-link" role="menuitem" @click="mobileMenuOpen = false"><Users :size="17" />团队介绍</RouterLink>
            <RouterLink to="/about" class="event-public-link" role="menuitem" @click="mobileMenuOpen = false"><Info :size="17" />关于我们</RouterLink>
            <RouterLink v-if="!auth.isLoggedIn.value" to="/login" class="event-public-link" role="menuitem" @click="mobileMenuOpen = false"><LogIn :size="17" />登录</RouterLink>
            <RouterLink v-if="auth.isLoggedIn.value" to="/dashboard" class="event-public-link" role="menuitem" @click="mobileMenuOpen = false"><LayoutDashboard :size="17" />进入控制台</RouterLink>
            <RouterLink v-if="auth.isAdmin.value" to="/developer" class="event-public-link" role="menuitem" @click="mobileMenuOpen = false"><ShieldCheck :size="17" />进入后台</RouterLink>
          </div>
        </Transition>
      </nav>
      <div v-if="mobileMenuOpen" class="event-mobile-backdrop" @click="mobileMenuOpen = false"></div>
    </header>
    <nav v-if="showPublicNav && auth.isLoggedIn.value" class="public-mobile-nav" aria-label="移动端快捷导航">
      <RouterLink to="/dashboard"><LayoutDashboard :size="18" /><span>控制台</span></RouterLink>
      <RouterLink to="/dashboard?panel=registration"><FilePenLine :size="18" /><span>我的报名</span></RouterLink>
      <RouterLink to="/dashboard?panel=team"><UserPlus :size="18" /><span>团队管理</span></RouterLink>
      <RouterLink to="/dashboard?panel=community"><MessageCircle :size="18" /><span>社区交流</span></RouterLink>
      <RouterLink v-if="auth.isAdmin.value" to="/developer"><ShieldCheck :size="18" /><span>进入后台</span></RouterLink>
      <button @click="auth.signOut()"><ArrowRight :size="18" /><span>退出登录</span></button>
    </nav>
    <RouterView v-slot="{ Component }"><Transition name="public-page" mode="out-in"><component :is="Component" :key="route.path" /></Transition></RouterView>
  </div>
</template>
