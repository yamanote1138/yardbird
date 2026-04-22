/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_YB_JMRI_HOST?: string
  readonly VITE_YB_JMRI_PORT?: string
  readonly VITE_YB_JMRI_SECURE?: string
  readonly VITE_YB_MOCK?: string
  readonly VITE_YB_DEBUG?: string
  readonly VITE_YB_DCCEX_ENABLED?: string
  readonly VITE_YB_DCCEX_HOST?: string
  readonly VITE_YB_DCCEX_PORT?: string
  readonly VITE_YB_DCCEX_PWM_FREQ?: string
  readonly VITE_YB_HA_ENABLED?: string
  readonly VITE_YB_HA_URL?: string
  readonly VITE_YB_HA_TOKEN?: string
  readonly VITE_YB_HA_AREA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
