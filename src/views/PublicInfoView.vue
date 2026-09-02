<script setup lang="ts">
import { ArrowRight, ArrowUpRight, CalendarDays, Code2, Globe2, HeartHandshake, MapPin, Rocket, Sparkles, Target, Users } from '@lucide/vue'
import { computed, onMounted, reactive } from 'vue'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'
import { safeAssetUrl, safeHttpUrl } from '../lib/safeUrl'

const props = defineProps<{ page: 'event' | 'team' | 'about' }>()
const auth = useAuth()
const teamPage = reactive({ tagline: '', intro: '', principles: '', members: [] as Array<{ id: string; name: string; role: string; bio: string; image_url: string | null; website_url?: string | null; github_url?: string | null }> })
const principles = computed(() => (teamPage.principles || '从真实问题出发｜让创造者相遇｜把想法做成作品').split('｜').filter(Boolean))
const joinTo = computed(() => auth.isLoggedIn.value ? '/dashboard' : '/register')
const fallbackPeople = [
  { id: 'curator', name: '内容与策划', role: 'CURATION', bio: '从一个值得被解决的问题开始，设计让创意发生的现场。', image_url: null, website_url: null, github_url: null },
  { id: 'builder', name: '产品与工程', role: 'PRODUCT & ENGINEERING', bio: '让每一位参与者都能把想法更快地带到可体验的版本。', image_url: null, website_url: null, github_url: null },
  { id: 'community', name: '社区与伙伴', role: 'COMMUNITY', bio: '连接创作者、导师和行业伙伴，让好作品持续被看见。', image_url: null, website_url: null, github_url: null },
]
const people = computed(() => teamPage.members.length ? teamPage.members : fallbackPeople)
onMounted(async () => { if (props.page !== 'team') return; const { data } = await supabase.rpc('get_public_team_page'); if (data) { Object.assign(teamPage, data); teamPage.members = teamPage.members.map(member => ({ ...member, image_url: safeAssetUrl(member.image_url) })) } })
</script>

<template>
  <main class="public-detail public-detail-rich">
    <section v-if="page === 'team'" class="rich-wrap mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pt-36">
      <header class="rich-hero team-rich-hero"><div><p class="section-label"><Sparkles :size="15"/>THE PEOPLE BEHIND MATRIX NOVA</p><h1>{{ teamPage.tagline || '让每一次行动，通往更大的可能。' }}</h1><p>{{ teamPage.intro || 'Matrix Nova 由产品、工程、设计与社区伙伴共同发起。我们相信，一个好现场不只提供舞台，也让每一位带着念头而来的人被认真对待。' }}</p><div class="rich-hero-actions"><RouterLink :to="joinTo" class="home-cta">加入我们 <ArrowRight :size="18"/></RouterLink><a href="#people" class="rich-text-link">认识团队 <ArrowUpRight :size="17"/></a></div></div><aside class="team-manifesto"><span>OUR MANIFESTO</span><b>“不等待完美条件，先让第一个版本发生。”</b><i>Matrix Nova / 创始团队</i></aside></header>
      <section class="rich-principles"><article v-for="(item, index) in principles" :key="item"><b>0{{ index + 1 }}</b><h2>{{ item }}</h2><p>{{ index === 0 ? '把注意力放在真实的人与真实的需求上，让每一次创作都有清晰的落点。' : index === 1 ? '让背景不同的人在协作里彼此启发，找到能够一起向前的伙伴。' : '用有限的时间做出真实的原型，让想法被体验、讨论并继续生长。' }}</p></article></section>
      <section class="rich-section"><div class="rich-section-head"><div><p class="section-label">HOW WE WORK</p><h2>把复杂的事，<br><span>做得有温度。</span></h2></div><p>我们不是只在赛事当天出现的执行团队。每一次活动之前，我们会打磨问题、连接导师、准备工具，也会在活动之后继续关注作品和人与人之间的连接。</p></div><div class="work-grid"><article><Target :size="23"/><h3>策划真实挑战</h3><p>从真实世界正在发生的议题里提问，让技术、设计与商业有机会共同回应。</p></article><article><Rocket :size="23"/><h3>支持快速试错</h3><p>提供清晰的节奏、工具与反馈，让每一个不成熟的念头都有机会成为原型。</p></article><article><HeartHandshake :size="23"/><h3>维护长期连接</h3><p>让队友、导师与伙伴不止在一个周末相遇，而是成为彼此后续行动的支持。</p></article></div></section>
      <section id="people" class="rich-section team-people-section"><div class="rich-section-head"><div><p class="section-label">CORE PEOPLE</p><h2>认真做事的人，<br><span>在这里相遇。</span></h2></div><p>以下是正在参与 Matrix Nova 的核心成员。成员资料、照片、职责与个人链接均可由后台团队页面持续维护。</p></div><div class="team-people-grid rich-people-grid"><article v-for="member in people" :key="member.id"><div class="team-person-image"><img v-if="member.image_url" :src="member.image_url" :alt="member.name"><div v-else class="team-person-placeholder">{{ member.name.slice(0,1) }}</div></div><div class="team-person-copy"><p>{{ member.role }}</p><h3>{{ member.name }}</h3><span>{{ member.bio }}</span><div v-if="safeHttpUrl(member.website_url) || safeHttpUrl(member.github_url)" class="team-person-links"><a v-if="safeHttpUrl(member.website_url)" :href="safeHttpUrl(member.website_url)" target="_blank" rel="noopener noreferrer" aria-label="个人官网"><Globe2 :size="16"/>官网<ArrowUpRight :size="13"/></a><a v-if="safeHttpUrl(member.github_url)" :href="safeHttpUrl(member.github_url)" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><Code2 :size="16"/>GitHub<ArrowUpRight :size="13"/></a></div></div></article></div></section>
      <section class="rich-closing"><Sparkles :size="19"/><div><p>我们一直在寻找愿意做出第一步的人。</p><span>无论你擅长产品、技术、设计、运营还是连接人与人，欢迎来到 Matrix Nova。</span></div><RouterLink :to="joinTo" class="secondary-button">开始加入 <ArrowRight :size="17"/></RouterLink></section>
    </section>

    <section v-else-if="page === 'event'" class="rich-wrap mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pt-36">
      <header class="rich-hero event-rich-hero"><div><p class="section-label"><Sparkles :size="15"/>MATRIX NOVA / EVENTS</p><h1>让创作走出屏幕，<br><span>在现场真正发生。</span></h1><p>赛事是 Matrix Nova 的起点：一段高密度的共创时间、一群愿意实践的人，以及从第一个版本开始的真实反馈。</p><div class="rich-hero-actions"><RouterLink :to="joinTo" class="home-cta">进入当前赛事 <ArrowRight :size="18"/></RouterLink></div></div><aside class="event-status-card"><span><i/>CURRENT EVENT</span><b>2026 创新者黑客松</b><p>48 小时 · 组队共创 · 原型展示</p><small>报名开放中，欢迎带着尚未完成的想法加入。</small></aside></header>
      <section class="current-event-panel"><div class="current-event-title"><p class="section-label">NOW HAPPENING</p><h2>当前赛事</h2><p>从报名、相遇到把作品带上舞台，每一步都为让好想法成为真实体验而设计。</p></div><div class="event-route"><article><b>01</b><CalendarDays :size="20"/><h3>报名与匹配</h3><p>提交你的技能与方向，找到同频队友，或以个人身份出发。</p></article><article><b>02</b><Users :size="20"/><h3>48 小时共创</h3><p>在导师、工具与现场支持中，把问题推到可体验的作品。</p></article><article><b>03</b><Rocket :size="20"/><h3>作品登场</h3><p>把成果交给真实观众、评委与伙伴，收获下一步的反馈。</p></article></div><div class="event-meta-row"><span><CalendarDays :size="16"/>赛事时间以报名页公告为准</span><span><MapPin :size="16"/>线下主会场与线上协作并行</span><span><Users :size="16"/>面向每一位创造者开放</span></div></section>
      <section class="rich-section past-events"><div class="rich-section-head"><div><p class="section-label">EVENT ARCHIVE</p><h2>过往赛事，<br><span>继续向前。</span></h2></div><p>每一期活动都会留下作品、伙伴和新的问题。这里会持续收录 Matrix Nova 的往届赛事与值得被记住的瞬间。</p></div><div class="archive-grid"><article><div><span>ARCHIVE / 01</span><b>创作马拉松</b></div><p>一次关于从灵感到原型的集中实验。参与者在短时间内完成了从组队、研究到展示的完整旅程。</p><small>赛事回顾内容持续整理中</small></article><article><div><span>ARCHIVE / 02</span><b>未来原型计划</b></div><p>围绕技术如何进入日常生活展开探索，让年轻创作者把抽象议题做成可被讨论的具体作品。</p><small>赛事回顾内容持续整理中</small></article><article class="archive-callout"><Sparkles :size="22"/><b>下一期故事，<br>也许由你开始。</b><RouterLink :to="joinTo">查看报名 <ArrowRight :size="16"/></RouterLink></article></div></section>
    </section>

    <section v-else class="rich-wrap mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pt-36">
      <header class="rich-hero about-rich-hero"><div><p class="section-label"><Sparkles :size="15"/>ABOUT MATRIX NOVA</p><h1>我们为开始的人，<br><span>留一盏灯。</span></h1><p>Matrix Nova 是一个面向创造者的赛事与社区。我们相信，很多改变并不是从一个完美答案开始，而是从有人愿意把第一个版本做出来开始。</p><div class="rich-hero-actions"><RouterLink :to="joinTo" class="home-cta">成为创造者 <ArrowRight :size="18"/></RouterLink></div></div><aside class="about-statement"><span>WHY WE EXIST</span><b>给想法一个被认真对待的开始，也给人与人一次真实协作的机会。</b></aside></header>
      <section class="about-story"><div class="about-story-index">01 — 03</div><div><p class="section-label">OUR STORY</p><h2>从“想做点什么”，<br>到“我们一起做出来”。</h2></div><p>我们看见许多有能力、有好奇心的人，常常只差一个合适的现场：有人可以一起讨论，有足够的时间去尝试，也有一个舞台去让作品被看见。于是 Matrix Nova 诞生了。我们希望把这一段从想法到行动的距离，变得短一些、温暖一些。</p></section>
      <section class="rich-section"><div class="rich-section-head"><div><p class="section-label">WHAT WE BELIEVE</p><h2>我们相信的，<br><span>从来不止技术。</span></h2></div><p>技术是工具，创作是语言，而人与人之间的信任和协作，才是让一个作品继续生长的底层力量。</p></div><div class="belief-grid"><article><b>01</b><h3>行动比等待更重要</h3><p>不用等到万事俱备。一个可被体验的初版，常常比十个停留在脑中的方案更有价值。</p></article><article><b>02</b><h3>多元让答案更完整</h3><p>产品、工程、设计、研究和运营的视角相遇，才能把同一个问题看得更深、更远。</p></article><article><b>03</b><h3>作品应该回到真实世界</h3><p>我们鼓励参与者从真实需求出发，在真实反馈中调整，让作品拥有继续发生的可能。</p></article></div></section>
      <section class="about-open"><div><p class="section-label">WHO IS THIS FOR</p><h2>如果你也想把一个念头，<br><span>变成一次行动。</span></h2></div><div class="about-open-list"><p><i/>正在寻找队友、方向或第一个作品的学生</p><p><i/>希望在真实项目里磨炼能力的开发者与设计师</p><p><i/>愿意分享经验、支持年轻创造者的导师与伙伴</p></div></section>
      <section class="rich-closing"><Sparkles :size="19"/><div><p>一个值得发生的开始，正在等待你。</p><span>加入 Matrix Nova，把你的下一步带到现场。</span></div><RouterLink :to="joinTo" class="secondary-button">立即加入 <ArrowRight :size="17"/></RouterLink></section>
    </section>
  </main>
</template>
