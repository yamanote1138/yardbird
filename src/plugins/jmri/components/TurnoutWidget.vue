<template>
  <div class="p-2">
    <UButton
      v-if="turnout"
      size="md"
      :color="buttonColor"
      :loading="changing"
      :disabled="!isConnected"
      @click="handleToggle"
    >
      <template #leading>
        <UIcon v-if="!changing" :name="icon" />
      </template>
      {{ turnout.userName || turnout.name }}
    </UButton>
    <p v-else class="text-neutral-500 text-sm">Turnout not found: {{ name }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { TurnoutState } from '@/types/jmri'

const props = defineProps<{ name: string }>()

const { jmriState, isConnected, toggleTurnout } = useJmri()

const changing = ref(false)

const turnout = computed(() => jmriState.value.turnouts.get(props.name))

const buttonColor = computed(() => {
  switch (turnout.value?.state) {
    case TurnoutState.THROWN:        return 'primary'
    case TurnoutState.CLOSED:        return 'neutral'
    case TurnoutState.INCONSISTENT:  return 'error'
    default:                         return 'warning'
  }
})

const icon = computed(() => {
  switch (turnout.value?.state) {
    case TurnoutState.CLOSED:        return 'i-heroicons-arrows-right-left'
    case TurnoutState.THROWN:        return 'i-mdi-shuffle-variant'
    case TurnoutState.INCONSISTENT:  return 'i-heroicons-exclamation-triangle'
    default:                         return 'i-heroicons-question-mark-circle'
  }
})

async function handleToggle() {
  if (!props.name) return
  changing.value = true
  try {
    await toggleTurnout(props.name)
  } finally {
    setTimeout(() => { changing.value = false }, 300)
  }
}
</script>
