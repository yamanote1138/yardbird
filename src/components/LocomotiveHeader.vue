<template>
  <div
    class="flex items-center loco-header"
    :class="{ 'disabled': disabled, 'compact': compact }"
    @click="!disabled && $emit('click')"
  >
    <img
      :src="imageSrc"
      :alt="name"
      class="loco-thumbnail mr-3"
      @error="onImageError"
    >
    <div class="flex-1 min-w-0">
      <h5 class="font-semibold mb-0 text-white">{{ name }}</h5>
      <small
        class="text-neutral-400"
        :class="{ 'hidden sm:block': compact }"
        v-if="road || number"
      >
        {{ road }} {{ number ? `#${number}` : '' }}
      </small>
      <slot name="status"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  name: string
  road?: string
  number?: string
  thumbnailUrl?: string
  disabled?: boolean
  compact?: boolean  // Use smaller thumbnail on mobile
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  compact: false
})

defineEmits<{
  click: []
}>()

// Placeholder image URL - size based on compact mode
const PLACEHOLDER_IMAGE = props.compact
  ? 'https://placehold.co/30x30/2d2d2d/888888?text=Loco'
  : 'https://placehold.co/100x100/2d2d2d/888888?text=Loco'

// Track if the real image failed to load
const imageLoadFailed = ref(false)

// Compute the image source - show thumbnail or fallback on error/missing
const imageSrc = computed(() => {
  if (imageLoadFailed.value || !props.thumbnailUrl) {
    return PLACEHOLDER_IMAGE
  }
  return props.thumbnailUrl
})

function onImageError() {
  imageLoadFailed.value = true
}
</script>

<style scoped>
.loco-header {
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-radius: 0.375rem;
  padding: 0.25rem;
  margin: -0.25rem;
}

.loco-header:hover:not(.disabled) {
  background-color: rgba(255, 255, 255, 0.05);
}

.loco-header.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.loco-thumbnail {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 0.375rem;
  transition: transform 0.2s ease;
}

/* Compact mode - smaller thumbnail on mobile */
.loco-header.compact .loco-thumbnail {
  width: 30px;
  height: 30px;
}

@media (min-width: 576px) {
  .loco-thumbnail {
    width: 100px;
    height: 100px;
  }
}

@media (min-width: 992px) {
  .loco-thumbnail {
    width: 200px;
    height: 200px;
  }
}

.loco-header:hover:not(.disabled) .loco-thumbnail {
  transform: scale(1.05);
}
</style>
