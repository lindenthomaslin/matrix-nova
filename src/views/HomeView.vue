<script setup lang="ts">
import { ArrowRight, CalendarDays, ChevronDown, MapPin, Sparkles, Users } from '@lucide/vue'
import { onMounted, reactive } from 'vue'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'
import { safeAssetUrl } from '../lib/safeUrl'

const auth = useAuth()
const home = reactive({ hero: '/images/matrix-nova-hero-v2.png', eyebrow: '2026 创新者黑客松', title: '在想象与行动之间，', highlight: '造出新的世界。', subtitle: '48 小时，跨越技术与创意。和优秀的伙伴一起，为真实世界创造值得被看见的产品。', cta: '开始报名', date: '10.16 — 10.18', location: '上海 · 西岸', capacity: '300 位创造者', aboutLabel: '从灵感到产品', aboutTitle: '一个周末，把', aboutHighlight: '可能性变成现场。', aboutDescription: '没有预设答案，只有一群愿意从问题出发、快速协作、把想法做成真实原型的人。', feature1Title: '48 小时极限共创', feature1Text: '从灵感、组队到可运行原型，让每一次判断在真实反馈里发生。', feature2Title: '开放命题，不限边界', feature2Text: 'AI、创意工具、未来生产力与可持续科技，都可以成为你的起点。', feature3Title: '让作品被看见', feature3Text: '和伙伴、导师及评委面对面，用产品讲出你的下一种可能。', footer: '© 2026 HackFlow. Build what matters.' })
const meteors = [
  { x: '76%', y: '11%', delay: '-1.2s', duration: '7.8s' },
  { x: '91%', y: '22%', delay: '-5.6s', duration: '9.4s' },
  { x: '60%', y: '7%', delay: '-8.5s', duration: '11.2s' },
  { x: '43%', y: '18%', delay: '-3.1s', duration: '13.5s' },
  { x: '84%', y: '38%', delay: '-10.2s', duration: '10.6s' },
  { x: '28%', y: '9%', delay: '-6.8s', duration: '15.5s' },
]
function moveGlow(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement
  const bounds = element.getBoundingClientRect()
  element.style.setProperty('--pointer-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`)
  element.style.setProperty('--pointer-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`)
}
onMounted(async () => {
  const { data } = await supabase.rpc('get_public_branding')
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return
  Object.assign(home, { hero: safeAssetUrl(row.home_hero_image_url, home.hero), eyebrow: row.home_eyebrow || home.eyebrow, title: row.home_title || home.title, highlight: row.home_highlight || home.highlight, subtitle: row.home_subtitle || home.subtitle, cta: row.home_cta_label || home.cta, date: row.home_event_date || home.date, location: row.home_location || home.location, capacity: row.home_capacity || home.capacity, aboutLabel: row.home_about_label || home.aboutLabel, aboutTitle: row.home_about_title || home.aboutTitle, aboutHighlight: row.home_about_highlight || home.aboutHighlight, aboutDescription: row.home_about_description || home.aboutDescription, feature1Title: row.home_feature_1_title || home.feature1Title, feature1Text: row.home_feature_1_text || home.feature1Text, feature2Title: row.home_feature_2_title || home.feature2Title, feature2Text: row.home_feature_2_text || home.feature2Text, feature3Title: row.home_feature_3_title || home.feature3Title, feature3Text: row.home_feature_3_text || home.feature3Text, footer: row.footer_content || home.footer })
})
</script>

<template>
  <main class="event-home event-home-v2 nexus-home">
    <section class="event-hero event-hero-v2 relative flex min-h-[100svh] items-center overflow-hidden px-5 pb-24 pt-28 sm:px-8" :style="home.hero ? { '--hero-image': `url(${home.hero})` } : undefined" @pointermove="moveGlow">
      <div class="home-dot-field" aria-hidden="true" />
      <div class="home-meteor-field" aria-hidden="true">
        <i v-for="meteor in meteors" :key="meteor.x + meteor.y" class="home-meteor" :style="{ '--meteor-x': meteor.x, '--meteor-y': meteor.y, '--meteor-delay': meteor.delay, '--meteor-duration': meteor.duration }" />
      </div>
      <div class="home-grid-plane" aria-hidden="true" />
      <div class="home-aurora home-aurora-one" aria-hidden="true" />
      <div class="home-aurora home-aurora-two" aria-hidden="true" />
      <div class="home-orbit home-orbit-one" aria-hidden="true" /><div class="home-orbit home-orbit-two" aria-hidden="true" />
      <div class="home-cursor-glow" aria-hidden="true" />
      <div class="relative z-10 mx-auto w-full max-w-6xl">
        <div class="home-topline"><div class="event-eyebrow home-eyebrow"><Sparkles :size="14" /> {{ home.eyebrow }}</div><span>HACKFLOW / 2026</span></div>
        <div class="home-hero-layout">
          <div class="home-copy">
            <p class="home-kicker">MAKE · TEST · SHIP</p>
            <h1 class="home-title"><span>{{ home.title }}</span><strong class="gradient-text">{{ home.highlight }}</strong></h1>
            <p class="home-subtitle">{{ home.subtitle }}</p>
            <div class="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <RouterLink :to="auth.isLoggedIn.value ? '/dashboard' : '/register'" class="home-cta">{{ auth.isLoggedIn.value ? '进入控制台' : home.cta }} <ArrowRight :size="18" /></RouterLink>
              <a href="#about" class="home-text-link">探索赛事 <ChevronDown :size="17" /></a>
            </div>
          </div>
          <aside class="home-signal-card home-spotlight-card" @pointermove="moveGlow"><div class="home-signal-head"><span class="home-signal-dot" />LIVE SIGNAL</div><div class="home-signal-bars"><i v-for="item in 19" :key="item" :style="{ '--bar-index': item }" /></div><p>打开创作频道<br><b>Build what matters.</b></p></aside>
        </div>
        <div class="home-data-rail">
          <div class="home-data-item home-spotlight-card" @pointermove="moveGlow"><CalendarDays :size="18" /><div><span>赛事时间</span><strong>{{ home.date }}</strong></div></div>
          <div class="home-data-item home-spotlight-card" @pointermove="moveGlow"><MapPin :size="18" /><div><span>线下主会场</span><strong>{{ home.location }}</strong></div></div>
          <div class="home-data-item home-spotlight-card" @pointermove="moveGlow"><Users :size="18" /><div><span>限时报名</span><strong>{{ home.capacity }}</strong></div></div>
          <a href="#about" class="home-scroll-cue"><span>SCROLL TO EXPLORE</span><ChevronDown :size="16" /></a>
        </div>
      </div>
    </section>
    <section id="event" class="event-about home-about px-5 py-24 sm:px-8 sm:py-32">
      <div class="mx-auto max-w-6xl"><div class="home-about-head"><div><p class="section-label">{{ home.aboutLabel }}</p><h2>{{ home.aboutTitle }}<br><span>{{ home.aboutHighlight }}</span></h2></div><p>{{ home.aboutDescription }}</p></div><div class="home-feature-grid"><article class="home-spotlight-card" @pointermove="moveGlow"><b>01</b><h3>{{ home.feature1Title }}</h3><p>{{ home.feature1Text }}</p></article><article class="home-spotlight-card" @pointermove="moveGlow"><b>02</b><h3>{{ home.feature2Title }}</h3><p>{{ home.feature2Text }}</p></article><article class="home-spotlight-card" @pointermove="moveGlow"><b>03</b><h3>{{ home.feature3Title }}</h3><p>{{ home.feature3Text }}</p></article></div></div>
    </section>
    <section id="team" class="home-team px-5 py-24 sm:px-8 sm:py-32"><div class="mx-auto max-w-6xl"><div class="home-section-heading"><div><p class="section-label">THE PEOPLE</p><h2>和相信行动的人<br><span>并肩向前。</span></h2></div><p>Matrix Nova 由产品、工程、设计与社区伙伴共同发起。我们相信最好的连接，发生在把想法真正做出来的过程里。</p></div><div class="team-grid"><article><span>01</span><h3>产品与策划</h3><p>从真实问题出发，设计值得投入的挑战与舞台。</p></article><article><span>02</span><h3>技术与工程</h3><p>提供可靠的工具、工作坊与技术支持，让灵感快速落地。</p></article><article><span>03</span><h3>社区与伙伴</h3><p>连接创造者、导师与行业伙伴，让好作品被持续看见。</p></article></div></div></section>
    <section id="about" class="home-about-us px-5 py-24 sm:px-8 sm:py-32"><div class="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_.85fr] lg:items-end"><div><p class="section-label">ABOUT MATRIX NOVA</p><h2>不只是一次赛事，<br><span>也是一次共同发生。</span></h2><p class="home-about-copy">我们搭建 Matrix Nova，是为了给愿意尝试的人一个真实的开始：你可以带着未完成的念头而来，和陌生但同频的伙伴并肩，在有限的时间里把它做成可被体验的作品。</p><RouterLink :to="auth.isLoggedIn.value ? '/dashboard' : '/register'" class="home-cta">加入 Matrix Nova <ArrowRight :size="18" /></RouterLink></div><div class="home-about-quote"><span>“</span><p>所有新事物，都从某个人决定开始动手的那一刻诞生。</p><b>Matrix Nova / 2026</b></div></div></section>
    <footer class="home-site-footer px-5 py-8 sm:px-8">{{ home.footer }}</footer>
  </main>
</template>
