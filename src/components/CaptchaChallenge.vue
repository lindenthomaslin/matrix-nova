<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{ siteKey?: string; theme?: 'light' | 'dark' | 'auto' }>(), { siteKey: '', theme: 'auto' })
const emit = defineEmits<{ verified: [token: string]; expired: []; error: [] }>()
const container = ref<HTMLElement | null>(null)
let widgetId: string | number | undefined

function renderWidget() {
  if (!container.value || !props.siteKey || !window.turnstile) return
  widgetId = window.turnstile.render(container.value, { sitekey: props.siteKey, theme: props.theme, callback: (token: string) => emit('verified', token), 'expired-callback': () => emit('expired'), 'error-callback': () => emit('error') })
}

onMounted(() => {
  if (window.turnstile) return renderWidget()
  const existing = document.querySelector('script[data-turnstile]')
  if (existing) { existing.addEventListener('load', renderWidget, { once: true }); return }
  const script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async = true; script.defer = true; script.dataset.turnstile = 'true'
  script.addEventListener('load', renderWidget, { once: true })
  document.head.appendChild(script)
})
onBeforeUnmount(() => { if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId) })
</script>

<template>
  <div v-if="siteKey" ref="container" class="turnstile-widget" aria-label="Cloudflare 人机验证" />
</template>

<style scoped>
.turnstile-widget { min-height: 65px; }
</style>
