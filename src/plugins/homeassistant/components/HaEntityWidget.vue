<template>
  <div class="p-2">
    <UButton
      v-if="entity"
      block
      size="md"
      :color="buttonColor"
      :disabled="!ha.isConnected.value"
      @click="ha.toggleEntity(entityId)"
    >
      <template #leading>
        <UIcon :name="icon" />
      </template>
      <span class="truncate min-w-0 text-xs @[120px]:text-sm">{{ entity.friendlyName }}</span>
    </UButton>
    <p v-else class="text-neutral-500 text-sm">Entity not found: {{ entityId }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useHomeAssistant } from '@/plugins/homeassistant'

const props = defineProps<{ entityId: string }>()

const ha = useHomeAssistant()

const entity = computed(() => {
  const all = [...ha.lights.value, ...ha.switches.value]
  return all.find(e => e.entityId === props.entityId)
})

const buttonColor = computed(() => {
  if (!entity.value) return 'neutral'
  return entity.value.state === 'on' ? 'primary' : 'neutral'
})

const icon = computed(() => {
  if (!entity.value) return 'i-heroicons-question-mark-circle'
  if (entity.value.domain === 'light') {
    return entity.value.state === 'on' ? 'i-mdi-lightbulb-on' : 'i-mdi-lightbulb-off-outline'
  }
  return entity.value.state === 'on' ? 'i-heroicons-bolt' : 'i-heroicons-bolt-slash'
})
</script>
