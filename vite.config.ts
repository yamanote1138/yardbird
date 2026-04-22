import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

function devConfigStub(): Plugin {
  return {
    name: 'dev-config-stub',
    configureServer(server) {
      server.middlewares.use('/config.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript')
        res.end('')
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), ui(), devConfigStub()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'jmri-client': fileURLToPath(new URL('./node_modules/jmri-client/dist/browser/jmri-client.js', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
rollupOptions: {
      output: {
        manualChunks: {
          'vue': ['vue']
        }
      }
    }
  }
})
