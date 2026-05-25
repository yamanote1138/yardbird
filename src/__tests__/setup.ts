import { config } from '@vue/test-utils'

config.global.stubs = {
  UButton: {
    inheritAttrs: false,
    template: `<button v-bind="$attrs"><slot name="leading" /><slot /></button>`,
  },
  UIcon: {
    props: ['name'],
    template: `<span :data-icon="name" />`,
  },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" v-bind="$attrs" />`,
  },
  UCheckbox: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked)" v-bind="$attrs" />`,
  },
  UModal: {
    props: ['modelValue', 'open'],
    emits: ['update:open', 'update:modelValue'],
    template: `<div v-if="open || modelValue"><slot name="header" /><slot name="body" /><slot name="footer" /><slot /></div>`,
  },
  UCard: {
    template: `<div><slot name="header" /><slot /><slot name="footer" /></div>`,
  },
  UAlert: {
    props: ['title', 'color', 'icon'],
    template: `<div role="alert">{{ title }}<slot /></div>`,
  },
  UToaster: {
    template: `<div />`,
  },
}

// Suppress "Failed to resolve component" noise for globally registered stubs
config.global.config.warnHandler = (msg: string) => {
  if (msg.includes('Failed to resolve component')) return
}
