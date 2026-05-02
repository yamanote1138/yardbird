<template>
  <div class="space-y-2">
    <label class="text-sm text-neutral-300 block mb-1">Turnout</label>
    <div v-if="options.length > 0" class="flex flex-col gap-1 max-h-48 overflow-y-auto">
      <button
        v-for="t in options"
        :key="t.name"
        class="px-3 py-2 text-sm rounded border text-left transition-colors"
        :class="selected === t.name
          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
          : 'border-white/20 bg-white/5 text-neutral-300 hover:border-white/40'"
        @click="selected = t.name"
      >
        {{ t.userName || t.name }}
        <span class="text-xs text-neutral-500 ml-1">({{ t.name }})</span>
      </button>
    </div>
    <div v-else>
      <UInput v-model="selected" placeholder="Turnout system name (e.g. LT1)" class="w-full" />
      <p class="text-xs text-neutral-500 mt-1">No turnouts loaded yet — enter name manually</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useJmri } from '@/plugins/jmri'

const props = defineProps<{ config: Record<string, unknown> }>()
const emit = defineEmits<{ update: [config: Record<string, unknown>] }>()

const { turnouts } = useJmri()

const selected = ref<string>((props.config.name as string) ?? '')
const options = computed(() =>
  turnouts.value.sort((a, b) => (a.userName || a.name).localeCompare(b.userName || b.name))
)

watch(selected, (name) => {
  emit('update', { name })
}, { immediate: true })
</script>
