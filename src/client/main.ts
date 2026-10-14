import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter, watchSession } from './router.ts'
import './style.css'

const router = createAppRouter()
watchSession(router)
createApp(App).use(createPinia()).use(router).mount('#app')
