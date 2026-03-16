import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

export default defineConfig({
  plugins: [vue(), ui()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'jmri-client': fileURLToPath(new URL('./node_modules/jmri-client/dist/browser/jmri-client.js', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: true  // Allow network access for testing on other devices
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue': ['vue']
        }
      }
    }
  }
})
