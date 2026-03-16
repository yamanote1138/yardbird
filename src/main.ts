import { createApp } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'

import './main.css'

const app = createApp(App)

app.use(ui)

// Global error handler
app.config.errorHandler = (err, instance, info) => {
  console.error('=== VUE ERROR ===')
  console.error('Error:', err)
  console.error('Info:', info)
  console.error('Component:', instance)
  console.error('=================')
}

// Global warning handler
app.config.warnHandler = (msg, instance, trace) => {
  console.warn('=== VUE WARNING ===')
  console.warn('Message:', msg)
  console.warn('Trace:', trace)
  console.warn('===================')
}

app.mount('#app')

// Log initialization
console.log('=== APP INITIALIZED ===')
console.log('Environment:', import.meta.env.MODE)
