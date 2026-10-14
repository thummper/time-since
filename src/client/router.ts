import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import { setUnauthorizedHandler } from './api/client.ts'
import { useAuthStore } from './stores/auth.ts'

/** Only same-site paths are allowed as a post-login target. */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [
      {
        path: '/',
        name: 'list',
        component: () => import('./views/TimerList.vue'),
        meta: { auth: true },
      },
      {
        path: '/timers/:id',
        name: 'timer',
        component: () => import('./views/TimerDetail.vue'),
        meta: { auth: true },
      },
      {
        path: '/settings',
        name: 'settings',
        component: () => import('./views/Settings.vue'),
        meta: { auth: true },
      },
      { path: '/welcome', name: 'welcome', component: () => import('./views/Welcome.vue') },
      { path: '/login', name: 'login', component: () => import('./views/Login.vue') },
      { path: '/register', name: 'register', component: () => import('./views/Register.vue') },
      { path: '/:rest(.*)*', redirect: '/' },
    ],
  })

  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    await auth.load()
    if (to.meta.auth && !auth.user) {
      return { name: 'welcome', query: { redirect: to.fullPath } }
    }
    // A demo visitor may still open sign-up from the demo banner.
    if (!to.meta.auth && auth.user && !auth.user.isDemo) return { name: 'list' }
    return true
  })

  return router
}

/** A 401 on a signed-in request means the session ended (R4, R7). */
export function watchSession(router: ReturnType<typeof createAppRouter>): void {
  setUnauthorizedHandler(() => {
    const auth = useAuthStore()
    if (!auth.user) return
    auth.expire()
    void router.replace({
      name: 'welcome',
      query: { redirect: router.currentRoute.value.fullPath },
    })
  })
}
