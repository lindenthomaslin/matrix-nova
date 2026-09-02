import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import { useAuth } from './composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/event', component: () => import('./views/PublicInfoView.vue'), props: { page: 'event' } },
    { path: '/team', component: () => import('./views/PublicInfoView.vue'), props: { page: 'team' } },
    { path: '/about', component: () => import('./views/PublicInfoView.vue'), props: { page: 'about' } },
    { path: '/register', component: () => import('./views/RegisterView.vue') },
    { path: '/login', component: () => import('./views/LoginView.vue') },
    { path: '/apply', redirect: '/dashboard' },
    { path: '/dashboard', component: () => import('./views/DashboardView.vue'), meta: { requiresAuth: true } },
    { path: '/developer', component: () => import('./views/DeveloperView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/403', component: () => import('./views/ForbiddenView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  await auth.initAuth()
  await auth.ensureSessionValid()
  if ((to.path === '/login' || to.path === '/register') && auth.user.value && !auth.profile.value) await auth.loadProfile()
  if (to.meta.requiresAuth && !auth.isLoggedIn.value) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.requiresAdmin && !auth.isAdmin.value) return '/403'
  if ((to.path === '/login' || to.path === '/register') && auth.isLoggedIn.value) return auth.isAdmin.value ? '/developer' : '/dashboard'
})

export default router
