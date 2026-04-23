<template>
  <div>
    <!-- HA Connection Status -->
    <UAlert
      v-if="ha.connectionState.value === 'connecting'"
      color="info"
      icon="i-heroicons-arrow-path"
      title="Connecting to Home Assistant..."
      class="mb-3"
    />
    <UAlert
      v-else-if="ha.connectionState.value === 'error'"
      color="error"
      icon="i-heroicons-exclamation-triangle"
      :title="ha.lastError.value || 'Home Assistant connection error'"
      class="mb-3"
    />
    <UAlert
      v-else-if="!ha.isConnected.value"
      color="warning"
      icon="i-heroicons-exclamation-triangle"
      title="Home Assistant not connected"
      class="mb-3"
    />

    <!-- Lights Section -->
    <div v-if="ha.lights.value.length > 0" class="mb-4">
      <h3 class="text-sm md:text-base font-medium text-neutral-400 mb-2 uppercase tracking-wider">Lights</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <UCard
          v-for="light in ha.lights.value"
          :key="light.entityId"
          :ui="{ body: 'py-2 sm:py-3' }"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium truncate mr-2">{{ light.friendlyName }}</span>
            <UButton
              size="md"
              :color="light.state === 'on' ? 'primary' : 'neutral'"
              :loading="togglingEntities.has(light.entityId)"
              :disabled="!ha.isConnected.value || light.state === 'unavailable'"
              @click="handleToggle(light.entityId)"
            >
              <template #leading>
                <UIcon
                  v-if="!togglingEntities.has(light.entityId)"
                  :name="light.state === 'on' ? 'i-mdi-lightbulb-on' : 'i-mdi-lightbulb-off-outline'"
                />
              </template>
              {{ light.state === 'on' ? 'On' : light.state === 'unavailable' ? 'N/A' : 'Off' }}
            </UButton>
          </div>

          <!-- Brightness slider -->
          <div v-if="light.state === 'on' && light.brightness !== undefined">
            <label class="text-xs text-neutral-400 mb-1 block">
              Brightness: {{ Math.round((light.brightness / 255) * 100) }}%
            </label>
            <input
              type="range"
              min="0"
              max="255"
              :value="light.brightness"
              class="w-full accent-blue-400"
              :disabled="!ha.isConnected.value"
              @change="handleBrightnessChange(light.entityId, ($event.target as HTMLInputElement).valueAsNumber)"
            />
          </div>
        </UCard>
      </div>
    </div>

    <!-- Switches Section -->
    <div v-if="ha.switches.value.length > 0" class="mb-4">
      <h3 class="text-sm md:text-base font-medium text-neutral-400 mb-2 uppercase tracking-wider">Switches</h3>
      <div class="flex flex-wrap gap-2 md:gap-3">
        <UButton
          v-for="sw in ha.switches.value"
          :key="sw.entityId"
          size="md"
          :color="sw.state === 'on' ? 'primary' : 'neutral'"
          :loading="togglingEntities.has(sw.entityId)"
          :disabled="!ha.isConnected.value || sw.state === 'unavailable'"
          @click="handleToggle(sw.entityId)"
        >
          <template #leading>
            <UIcon
              v-if="!togglingEntities.has(sw.entityId)"
              :name="sw.state === 'on' ? 'i-heroicons-bolt' : 'i-mdi-power'"
            />
          </template>
          {{ sw.friendlyName }}
        </UButton>
      </div>
    </div>

    <!-- Empty State -->
    <UAlert
      v-if="ha.isConnected.value && ha.lights.value.length === 0 && ha.switches.value.length === 0"
      color="info"
      icon="i-heroicons-information-circle"
      title="No lights or switches found in the configured area."
      class="mt-3 text-sm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useHomeAssistant } from '@/plugins/homeassistant'
import { logger } from '@/utils/logger'

const ha = useHomeAssistant()
const togglingEntities = ref<Set<string>>(new Set())

async function handleToggle(entityId: string) {
  togglingEntities.value.add(entityId)
  try {
    await ha.toggleEntity(entityId)
  } catch (error) {
    logger.error('[Room] Toggle failed:', error)
  } finally {
    setTimeout(() => {
      togglingEntities.value.delete(entityId)
    }, 300)
  }
}

async function handleBrightnessChange(entityId: string, rawValue: number) {
  try {
    await ha.setBrightness(entityId, rawValue)
  } catch (error) {
    logger.error('[Room] Brightness change failed:', error)
  }
}
</script>
