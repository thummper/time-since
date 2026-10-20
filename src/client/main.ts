import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter, watchSession } from './router.ts'
import { initTheme } from './theme.ts'
import '@fontsource-variable/outfit'
import '@fontsource-variable/jetbrains-mono'
import './style.css'

initTheme()
const router = createAppRouter()
watchSession(router)
createApp(App).use(createPinia()).use(router).mount('#app')
