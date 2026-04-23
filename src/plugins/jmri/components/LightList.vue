<template>
  <div>
    <!-- Lights Section -->
    <div v-if="sortedLights.length > 0">
      <div class="flex flex-wrap gap-2 md:gap-3">
        <UButton
          v-for="light in sortedLights"
          :key="light.name"
          size="md"
          :color="getLightButtonColor(light)"
          :loading="changingLights.has(light.name)"
          :disabled="!isConnected"
          @click="handleToggle(light.name)"
        >
          <template #leading>
            <UIcon v-if="!changingLights.has(light.name)" :name="getLightIcon(light.state)" />
          </template>
          {{ light.userName || light.name }}
        </UButton>
      </div>
    </div>

    <!-- Empty State -->
    <UAlert
      v-else-if="isConnected"
      color="info"
      icon="i-heroicons-information-circle"
      title="No lights configured. Add lights in JMRI to see them here."
      class="mt-3 text-sm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { LightState } from '@/types/jmri'
import type { LightData } from '@/types/jmri'

const { lights, isConnected, toggleLight } = useJmri()

const changingLights = ref<Set<string>>(new Set())

// Sort lights by name (system name or user name)
const sortedLights = computed(() => {
  return [...lights.value].sort((a, b) => {
    const aName = a.userName || a.name
    const bName = b.userName || b.name
    return aName.localeCompare(bName)
  })
})

function getLightButtonColor(light: LightData): string {
  switch (light.state) {
    case LightState.ON:
      return 'primary'
    case LightState.OFF:
      return 'neutral'
    case LightState.UNKNOWN:
    default:
      return 'warning'
  }
}

function getLightIcon(state: LightState): string {
  switch (state) {
    case LightState.ON:
      return 'i-mdi-lightbulb-on'
    case LightState.OFF:
      return 'i-mdi-lightbulb-off-outline'
    case LightState.UNKNOWN:
    default:
      return 'i-heroicons-question-mark-circle'
  }
}

async function handleToggle(name: string) {
  changingLights.value.add(name)
  try {
    await toggleLight(name)
  } finally {
    setTimeout(() => {
      changingLights.value.delete(name)
    }, 300)
  }
}
</script>
