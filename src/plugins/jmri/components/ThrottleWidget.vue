<template>
  <div>
    <ThrottleCard
      v-if="throttle"
      :throttle="throttle"
    />
    <template v-else>
      <RosterCard
        v-if="entry"
        :entry="entry"
        :command-station="commandStation"
      />
      <div v-else class="p-3">
        <UAlert
          color="warning"
          icon="i-heroicons-question-mark-circle"
          :title="`Locomotive address ${address} not in roster`"
        />
      </div>
      <div v-if="widgetId" class="flex justify-end px-1">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          @click="changeLoco"
        >
          <template #leading><UIcon name="i-mdi-swap-horizontal" /></template>
          Change loco
        </UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import { useJmri } from '@/plugins/jmri'
import { useConfig } from '@/core/useConfig'
import { useWidgetConfig } from '@/composables/useWidgetConfig'
import { WIDGET_ID_KEY } from '@/widgets/widgetContext'
import ThrottleCard from './ThrottleCard.vue'
import RosterCard from './RosterCard.vue'

const props = defineProps<{ address: number; commandStation?: string }>()

const { jmriState } = useJmri()
const cfg = useConfig()
const wc = useWidgetConfig()
const widgetId = inject(WIDGET_ID_KEY, null)

const throttle = computed(() => jmriState.value.throttles.get(props.address))
const entry    = computed(() => jmriState.value.roster.get(props.address))

function changeLoco() {
  if (!widgetId) return
  const current: Record<string, unknown> = { address: props.address }
  if (props.commandStation !== undefined) current.commandStation = props.commandStation
  wc.openForEdit(widgetId, 'jmri-throttle', current, (newConfig) => {
    cfg.updateWidgetConfig(widgetId, newConfig)
  })
}
</script>
