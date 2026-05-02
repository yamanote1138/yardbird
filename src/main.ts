import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'

import './main.css'
import 'gridstack/dist/gridstack.min.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: App }]
})

const app = createApp(App)
app.use(router)
app.use(ui)
app.mount('#app')
