<template>
  <div class="flex items-center w-full">
    <!-- Sortable tab list -->
    <VueDraggable
      v-model="localTabs"
      tag="ul"
      class="flex flex-wrap -mb-px text-sm md:text-base font-medium flex-1"
      :animation="150"
      handle=".tab-drag-handle"
      @end="onReorder"
    >
      <li v-for="tab in localTabs" :key="tab.id" class="me-2 relative group">
        <button
          class="inline-flex items-center justify-center p-4 md:px-5 md:py-4 border-b-2 rounded-t transition-colors"
          :class="activeTab === tab.id
            ? 'text-blue-400 border-blue-400'
            : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'"
          @click="$emit('select', tab.id)"
          @dblclick="startRename(tab.id)"
        >
          <!-- Drag handle (only visible in edit mode) -->
          <UIcon name="i-heroicons-bars-2" class="tab-drag-handle w-3 h-3 me-1 text-white/30 cursor-grab active:cursor-grabbing" />
          <UIcon :name="tab.icon" class="w-4 h-4 md:w-5 md:h-5 me-2" />

          <!-- Inline rename -->
          <input
            v-if="renamingTabId === tab.id"
            ref="renameInput"
            v-model="renameValue"
            class="bg-transparent border-b border-blue-400 outline-none text-white w-24 text-sm"
            @keydown.enter="commitRename(tab.id)"
            @keydown.escape="renamingTabId = null"
            @blur="commitRename(tab.id)"
            @click.stop
          />
          <span v-else>{{ tab.name }}</span>
        </button>

        <!-- Edit button (hover) -->
        <button
          class="absolute -top-1 right-3 w-4 h-4 rounded-full bg-neutral-800 border border-white/20
                 text-white/40 hover:text-blue-400 hover:bg-blue-400/10 hidden group-hover:flex
                 items-center justify-center transition-colors"
          title="Edit tab"
          @click.stop="startEdit(tab)"
        >
          <UIcon name="i-heroicons-pencil" class="w-2.5 h-2.5" />
        </button>

        <!-- Delete button (hover) -->
        <button
          class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neutral-800 border border-white/20
                 text-white/40 hover:text-red-400 hover:bg-red-400/10 hidden group-hover:flex
                 items-center justify-center transition-colors"
          title="Delete tab"
          @click.stop="confirmDelete(tab)"
        >
          <UIcon name="i-heroicons-x-mark" class="w-2.5 h-2.5" />
        </button>
      </li>
    </VueDraggable>

    <!-- Add tab button -->
    <button
      class="flex items-center gap-1 px-3 py-4 text-white/40 hover:text-white/70 transition-colors flex-shrink-0 text-sm"
      title="Add tab"
      @click="editingTab = null; tabModalName = ''; tabModalIcon = 'i-mdi-view-grid'; showTabModal = true"
    >
      <UIcon name="i-heroicons-plus" class="w-4 h-4" />
    </button>

    <!-- Edit mode actions -->
    <div class="flex items-center gap-1 px-2 pb-px flex-shrink-0">
      <span class="text-xs text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 me-1">
        Editing
      </span>
      <button
        class="p-1.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        title="Export config"
        @click="exportConfig"
      >
        <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        title="Import config"
        @click="fileInput?.click()"
      >
        <UIcon name="i-heroicons-arrow-up-tray" class="w-4 h-4" />
      </button>
      <button
        class="p-1.5 rounded text-white/40 hover:text-red-400 hover:bg-red-400/5 transition-colors"
        title="Reset to defaults"
        @click="showResetConfirm = true"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
      </button>
      <input ref="fileInput" type="file" accept=".yaml,.yml" class="hidden" @change="handleFileSelect" />
    </div>
  </div>

  <!-- Add / Edit Tab Modal -->
  <UModal v-model:open="showTabModal" :title="editingTab ? 'Edit Tab' : 'Add Tab'" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div class="space-y-3">
        <div>
          <label class="text-sm text-neutral-300 block mb-1">Name</label>
          <UInput v-model="tabModalName" placeholder="e.g. Controls" class="w-full" @keydown.enter="commitTabModal" />
        </div>
        <div>
          <label class="text-sm text-neutral-300 block mb-1">Icon</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="opt in ICON_OPTIONS"
              :key="opt.icon"
              class="p-2 rounded border transition-colors"
              :class="tabModalIcon === opt.icon
                ? 'border-blue-500 bg-blue-500/20'
                : 'border-white/20 bg-white/5 hover:border-white/40'"
              :title="opt.label"
              @click="tabModalIcon = opt.icon"
            >
              <UIcon :name="opt.icon" class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showTabModal = false">Cancel</UButton>
        <UButton color="primary" :disabled="!tabModalName.trim()" @click="commitTabModal">
          {{ editingTab ? 'Save' : 'Add Tab' }}
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Import Preview Modal -->
  <UModal v-model:open="showImportModal" title="Import Config" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <div v-if="importError" class="text-red-400 text-sm">{{ importError }}</div>
      <div v-else-if="importPreview" class="space-y-2 text-sm">
        <p class="text-neutral-300">The following config will replace your current layout:</p>
        <dl class="space-y-1 mt-2">
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">Tabs</dt>
            <dd class="text-neutral-200">{{ importPreview.tabs.length }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">Widgets</dt>
            <dd class="text-neutral-200">{{ importPreview.tabs.reduce((n, t) => n + t.widgets.length, 0) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">JMRI</dt>
            <dd class="text-neutral-200">{{ importPreview.connections.jmri ? `${importPreview.connections.jmri.host}:${importPreview.connections.jmri.port}` : '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">Home Assistant</dt>
            <dd class="text-neutral-200">{{ importPreview.connections.homeassistant?.url ?? '—' }}</dd>
          </div>
        </dl>
        <p class="text-amber-400 text-xs mt-3">This will overwrite your current config. This cannot be undone.</p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showImportModal = false">Cancel</UButton>
        <UButton v-if="!importError" color="primary" @click="commitImport">Import</UButton>
      </div>
    </template>
  </UModal>

  <!-- Reset Confirm Modal -->
  <UModal v-model:open="showResetConfirm" title="Reset to Defaults" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <p class="text-neutral-300 text-sm">
        This will clear your saved layout and reload from the default config. All tabs and widgets will be lost.
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showResetConfirm = false">Cancel</UButton>
        <UButton color="error" @click="resetConfig">Reset</UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete Confirm Modal -->
  <UModal v-model:open="showDeleteModal" title="Delete Tab" :ui="{ content: 'max-w-sm' }">
    <template #body>
      <p class="text-neutral-300 text-sm">
        Delete <strong>{{ deletingTab?.name }}</strong>?
        <span v-if="deletingTab && tabWidgetCount(deletingTab.id) > 0" class="text-amber-400">
          This tab has {{ tabWidgetCount(deletingTab.id) }} widget(s) that will also be removed.
        </span>
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
        <UButton color="error" @click="deleteTab">Delete</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import yaml from 'js-yaml'
import { useConfig } from '@/core/useConfig'
import type { TabConfig, StoredConfig } from '@/core/types'

const ICON_OPTIONS = [
  { icon: 'i-mdi-train',           label: 'Train' },
  { icon: 'i-mdi-tram',            label: 'Tram' },
  { icon: 'i-mdi-source-branch',   label: 'Turnout' },
  { icon: 'i-mdi-lightbulb-outline', label: 'Light' },
  { icon: 'i-mdi-home',            label: 'Home' },
  { icon: 'i-mdi-view-grid',       label: 'Grid' },
  { icon: 'i-heroicons-bolt',       label: 'Power' },
  { icon: 'i-mdi-map',             label: 'Map' },
  { icon: 'i-mdi-controller',      label: 'Controller' },
  { icon: 'i-mdi-gauge',           label: 'Gauge' },
  { icon: 'i-mdi-cog',             label: 'Settings' },
  { icon: 'i-mdi-star',            label: 'Star' },
]

const props = defineProps<{ activeTab: string }>()
const emit = defineEmits<{
  select: [tabId: string]
  tabsChanged: []
}>()

const cfg = useConfig()

const localTabs = ref<TabConfig[]>([...cfg.tabs.value])

watch(cfg.tabs, (t) => { localTabs.value = [...t] })

// ── Rename ────────────────────────────────────────────────────────────────────

const renamingTabId = ref<string | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function startRename(tabId: string) {
  const tab = localTabs.value.find(t => t.id === tabId)
  if (!tab) return
  renameValue.value = tab.name
  renamingTabId.value = tabId
  nextTick(() => renameInput.value?.select())
}

function commitRename(tabId: string) {
  const trimmed = renameValue.value.trim()
  if (!trimmed) { renamingTabId.value = null; return }
  cfg.saveTabs(cfg.tabs.value.map(t => t.id === tabId ? { ...t, name: trimmed } : t))
  renamingTabId.value = null
  emit('tabsChanged')
}

// ── Reorder ───────────────────────────────────────────────────────────────────

function onReorder() {
  cfg.saveTabs(localTabs.value)
  emit('tabsChanged')
}

// ── Add / Edit ────────────────────────────────────────────────────────────────

const showTabModal = ref(false)
const editingTab = ref<TabConfig | null>(null)
const tabModalName = ref('')
const tabModalIcon = ref('i-mdi-view-grid')

function startEdit(tab: TabConfig) {
  editingTab.value = tab
  tabModalName.value = tab.name
  tabModalIcon.value = tab.icon
  showTabModal.value = true
}

function commitTabModal() {
  const name = tabModalName.value.trim()
  if (!name) return
  if (editingTab.value) {
    cfg.saveTabs(cfg.tabs.value.map(t =>
      t.id === editingTab.value!.id ? { ...t, name, icon: tabModalIcon.value } : t
    ))
  } else {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now()
    const newTab: TabConfig = { id, name, icon: tabModalIcon.value, widgets: [] }
    cfg.saveTabs([...cfg.tabs.value, newTab])
    emit('select', id)
  }
  emit('tabsChanged')
  showTabModal.value = false
  editingTab.value = null
  tabModalName.value = ''
  tabModalIcon.value = 'i-mdi-view-grid'
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportConfig() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const filename = `yardbird-config-${stamp}.yaml`
  const text = yaml.dump(cfg.config.value, { indent: 2, lineWidth: 120 })
  const blob = new Blob([text], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import ────────────────────────────────────────────────────────────────────

const fileInput = ref<HTMLInputElement | null>(null)
const showImportModal = ref(false)
const importPreview = ref<StoredConfig | null>(null)
const importError = ref<string | null>(null)

function validateConfig(obj: unknown): obj is StoredConfig {
  if (!obj || typeof obj !== 'object') return false
  const c = obj as Record<string, unknown>
  if (c.version !== 1) return false
  if (!c.connections || typeof c.connections !== 'object') return false
  if (!Array.isArray(c.tabs)) return false
  for (const tab of c.tabs as unknown[]) {
    if (!tab || typeof tab !== 'object') return false
    const t = tab as Record<string, unknown>
    if (typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.icon !== 'string') return false
    if (!Array.isArray(t.widgets)) return false
  }
  return true
}

function handleFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const parsed = yaml.load(e.target?.result as string)
      if (!validateConfig(parsed)) {
        importError.value = 'Invalid config file — missing required fields or wrong version.'
        importPreview.value = null
      } else {
        importPreview.value = parsed
        importError.value = null
      }
    } catch {
      importError.value = 'Failed to parse YAML — check the file for syntax errors.'
      importPreview.value = null
    }
    showImportModal.value = true
    if (fileInput.value) fileInput.value.value = ''
  }
  reader.readAsText(file)
}

function commitImport() {
  if (!importPreview.value) return
  cfg.save(importPreview.value)
  showImportModal.value = false
  importPreview.value = null
  emit('tabsChanged')
}

// ── Reset ─────────────────────────────────────────────────────────────────────

const showResetConfirm = ref(false)

function resetConfig() {
  cfg.reset()
  showResetConfirm.value = false
  emit('tabsChanged')
}

// ── Delete ────────────────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deletingTab = ref<TabConfig | null>(null)

function tabWidgetCount(tabId: string): number {
  return cfg.tabs.value.find(t => t.id === tabId)?.widgets.length ?? 0
}

function confirmDelete(tab: TabConfig) {
  deletingTab.value = tab
  showDeleteModal.value = true
}

function deleteTab() {
  if (!deletingTab.value) return
  const remaining = cfg.tabs.value.filter(t => t.id !== deletingTab.value!.id)
  cfg.saveTabs(remaining)
  showDeleteModal.value = false
  emit('tabsChanged')
  deletingTab.value = null
}
</script>
