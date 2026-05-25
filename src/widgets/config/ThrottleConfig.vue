<template>
  <div class="space-y-3">
    <div>
      <label class="text-sm text-neutral-300 block mb-1">DCC Address</label>
      <UInput
        v-model="addressStr"
        type="number"
        min="1"
        max="9999"
        placeholder="e.g. 3"
        class="w-full"
      />
    </div>

    <div v-if="commandStations.length > 0">
      <label class="text-sm text-neutral-300 block mb-1">Command Station</label>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="cs in commandStations"
          :key="cs.prefix"
          class="px-2 py-1 text-xs rounded border transition-colors"
          :class="selectedCommandStation === cs.prefix
            ? 'border-blue-500 bg-blue-500/20 text-blue-300'
            : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40'"
          @click="selectedCommandStation = cs.prefix"
        >
          {{ cs.name }}
        </button>
      </div>
    </div>

    <div v-if="allRoster.length > 0" class="space-y-2">
      <p class="text-xs text-neutral-500">Or pick from roster:</p>

      <div v-for="group in groupedRoster" :key="group.name">
        <p class="text-xs text-neutral-400 mb-1">{{ group.name }}</p>
        <div class="flex flex-wrap gap-1.5">
          <RosterButton
            v-for="entry in group.entries"
            :key="entry.address"
            :entry="entry"
            :selected="selectedAddress"
            @select="selectedAddress = $event"
          />
          <p v-if="!group.entries.length" class="text-xs text-neutral-600">None connected</p>
        </div>
      </div>

      <div v-if="ungroupedRoster.length > 0">
        <p v-if="groupedRoster.length > 0" class="text-xs text-neutral-400 mb-1">DCC Locos</p>
        <div class="flex flex-wrap gap-1.5">
          <RosterButton
            v-for="entry in ungroupedRoster"
            :key="entry.address"
            :entry="entry"
            :selected="selectedAddress"
            @select="selectedAddress = $event"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineComponent, h } from 'vue'
import { useJmri } from '@/plugins/jmri'
import type { RosterEntry } from '@/types/jmri'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const { ungroupedRoster, groupedRoster, commandStations } = useJmri()

const selectedAddress = ref<number>((props.config.address as number) ?? 0)
const addressStr = computed({
  get: () => selectedAddress.value > 0 ? String(selectedAddress.value) : '',
  set: (v) => { const n = parseInt(v); if (!isNaN(n)) selectedAddress.value = n },
})

const selectedCommandStation = ref<string>(
  (props.config.commandStation as string) ?? commandStations.value[0]?.prefix ?? ''
)

const allRoster = computed(() => [
  ...groupedRoster.value.flatMap(g => g.entries),
  ...ungroupedRoster.value,
])

const RosterButton = defineComponent({
  props: {
    entry: { type: Object as () => RosterEntry, required: true },
    selected: { type: Number, required: true },
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => h('button', {
      class: [
        'px-2 py-1 text-xs rounded border transition-colors',
        props.selected === props.entry.address
          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
          : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40',
      ],
      onClick: () => emit('select', props.entry.address),
    }, `${props.entry.name} (${props.entry.address})`)
  },
})

watch([selectedAddress, selectedCommandStation], ([addr, cs]) => {
  emit('update', { address: addr, commandStation: cs })
}, { immediate: true })
</script>
