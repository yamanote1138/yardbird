<template>
  <div class="p-2">
    <UButton
      block
      :color="buttonColor"
      :disabled="!isConnected || busy"
      @click="handleToggle"
    >
      <template #leading>
        <UIcon :name="buttonIcon" />
      </template>
      <span class="truncate min-w-0 text-xs @[120px]:text-sm">{{ label || 'Power' }}</span>
    </UButton>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { PowerState } from 'jmri-client'
import { logger } from '@/utils/logger'

const props = defineProps<{
  prefix: string
  label?: string
}>()

const { isConnected, powerByPrefix, power, setPower } = useJmri()

const busy = ref(false)

const state = computed(() => {
  if (props.prefix !== undefined && props.prefix !== '') {
    return powerByPrefix.value.get(props.prefix) ?? PowerState.UNKNOWN
  }
  return power.value
})

const buttonColor = computed(() => {
  if (state.value === PowerState.ON)  return 'primary'
  if (state.value === PowerState.OFF) return 'neutral'
  return 'warning'
})

const buttonIcon = computed(() => {
  if (state.value === PowerState.ON)  return 'i-heroicons-bolt'
  if (state.value === PowerState.OFF) return 'i-mdi-power'
  return 'i-heroicons-question-mark-circle'
})

async function handleToggle() {
  if (busy.value) return
  busy.value = true
  try {
    const next = state.value === PowerState.ON ? 'off' : 'on'
    await setPower(next, props.prefix !== '' ? props.prefix : undefined)
  } catch (e) {
    logger.error('PowerWidget: failed to set power:', e)
  } finally {
    busy.value = false
  }
}
</script>
