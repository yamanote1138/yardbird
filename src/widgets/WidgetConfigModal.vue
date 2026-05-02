<template>
  <UModal v-model:open="isOpen" :title="title" :ui="{ content: 'max-w-md' }">
    <template #body>
      <component
        :is="configComponent"
        v-if="configComponent && pending"
        :config="localConfig"
        @update="localConfig = $event"
      />
      <p v-else class="text-neutral-400 text-sm">No configuration needed.</p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="wc.cancel()">Cancel</UButton>
        <UButton color="primary" @click="handleConfirm">
          {{ pending?.widgetId ? 'Save' : 'Add Widget' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, type Component } from 'vue'
import { useWidgetConfig } from '@/composables/useWidgetConfig'
import { getWidgetDef } from '@/widgets/registry'

const wc = useWidgetConfig()
const { pending } = wc

const isOpen = computed({
  get: () => pending.value !== null,
  set: (v) => { if (!v) wc.cancel() },
})

const localConfig = ref<Record<string, unknown>>({})

watch(pending, (p) => {
  if (p) localConfig.value = { ...p.config }
}, { immediate: true })

const title = computed(() => {
  if (!pending.value) return ''
  const def = getWidgetDef(pending.value.widgetType)
  return pending.value.widgetId ? `Configure ${def.name}` : `Add ${def.name}`
})

const CONFIG_COMPONENTS: Record<string, () => Promise<Component>> = {
  'jmri-throttle': () => import('@/widgets/config/ThrottleConfig.vue'),
  'jmri-turnout':  () => import('@/widgets/config/TurnoutConfig.vue'),
  'jmri-light':    () => import('@/widgets/config/LightConfig.vue'),
  'jmri-power':    () => import('@/widgets/config/PowerConfig.vue'),
  'ha-entity':     () => import('@/widgets/config/HaEntityConfig.vue'),
}

const configComponent = computed(() => {
  if (!pending.value) return null
  const loader = CONFIG_COMPONENTS[pending.value.widgetType]
  return loader ? defineAsyncComponent(loader) : null
})

function handleConfirm() {
  wc.confirm(localConfig.value)
}
</script>
