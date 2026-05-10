<template>
  <div class="p-2">
    <UButton
      v-if="light"
      block
      size="md"
      :color="buttonColor"
      :loading="changing"
      :disabled="!isConnected"
      @click="handleToggle"
    >
      <template #leading>
        <UIcon v-if="!changing" :name="icon" />
      </template>
      <span class="truncate min-w-0 text-xs @[120px]:text-sm">{{ light.userName || light.name }}</span>
    </UButton>
    <p v-else class="text-neutral-500 text-sm">Light not found: {{ name }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { LightState } from '@/types/jmri'

const props = defineProps<{ name: string }>()

const { jmriState, isConnected, toggleLight } = useJmri()

const changing = ref(false)

const light = computed(() => jmriState.value.lights.get(props.name))

const buttonColor = computed(() => {
  switch (light.value?.state) {
    case LightState.ON:   return 'primary'
    case LightState.OFF:  return 'neutral'
    default:              return 'warning'
  }
})

const icon = computed(() => {
  switch (light.value?.state) {
    case LightState.ON:   return 'i-mdi-lightbulb-on'
    case LightState.OFF:  return 'i-mdi-lightbulb-off-outline'
    default:              return 'i-heroicons-question-mark-circle'
  }
})

async function handleToggle() {
  if (!props.name) return
  changing.value = true
  try {
    await toggleLight(props.name)
  } finally {
    setTimeout(() => { changing.value = false }, 300)
  }
}
</script>
