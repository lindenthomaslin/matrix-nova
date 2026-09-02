import { ref } from 'vue'
import { supabase } from './supabase'
import { safeAssetUrl } from './safeUrl'

export const fallbackHeroImage = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1800&q=85'

const heroImage = ref(fallbackHeroImage)
const siteIcon = ref('')
const siteName = ref('Matrix Nova')
const siteSubtitle = ref('创新者黑客松')

export function useBranding() {
  async function loadBranding() {
    const { data } = await supabase.rpc('get_public_branding')
    const row = Array.isArray(data) ? data[0] : data
    if (row?.auth_hero_image_url) heroImage.value = safeAssetUrl(row.auth_hero_image_url, fallbackHeroImage)
    if (row?.site_icon_url) siteIcon.value = safeAssetUrl(row.site_icon_url)
    if (row?.site_name) siteName.value = row.site_name
    if (row?.site_subtitle) siteSubtitle.value = row.site_subtitle
    if (row?.site_icon_url) {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (icon) icon.href = siteIcon.value
    }
    if (typeof document !== 'undefined') document.title = siteName.value
    return heroImage.value
  }
  return { heroImage, siteIcon, siteName, siteSubtitle, loadBranding }
}
