<template>
  <div class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center">
    <div class="text-center max-w-sm px-6">
      <UIcon name="i-mdi-train" class="w-16 h-16 md:w-20 md:h-20 text-blue-400 mx-auto mb-6" />
      <h1 class="text-3xl md:text-4xl font-bold mb-2">YardBird</h1>
      <p class="text-neutral-400 md:text-lg mb-10">Your JMRI layout control panel</p>

      <UAlert
        v-if="errorMessage"
        color="error"
        icon="i-heroicons-exclamation-triangle"
        :title="errorMessage"
        class="mb-6 text-left"
      />

      <UButton
        size="xl"
        color="success"
        block
        :loading="isConnecting"
        :disabled="isConnecting"
        @click="handleBoard"
      >
        <template v-if="!isConnecting" #leading>
          <UIcon name="i-mdi-train-variant" />
        </template>
        {{ isConnecting ? 'Departing...' : 'All Aboard!' }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  connect: []
}>()

const isConnecting = ref(false)
const errorMessage = ref('')

const handleBoard = () => {
  errorMessage.value = ''
  isConnecting.value = true
  emit('connect')
}

defineExpose({
  setError: (message: string) => {
    errorMessage.value = message
    isConnecting.value = false
  },
  setConnecting: (connecting: boolean) => {
    isConnecting.value = connecting
  }
})
</script>
