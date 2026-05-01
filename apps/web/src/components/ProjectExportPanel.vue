<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiFetch } from '../api'
import LocaleSelect from './LocaleSelect.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ projectId: string }>()
const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const { t } = useI18n()

interface Locale {
  id: string
  code: string
  name: string
}

const locales = ref<Locale[]>([])
const format = ref<'json' | 'csv' | 'xlsx'>('json')
const selectedLocale = ref('')
const selectedStatus = ref('')
const exporting = ref(false)
const error = ref('')
const resolveRefs = ref(false)
const splitByNamespace = ref(false)

const statusOptions = computed(() => [
  { value: '', label: t('export.allStatuses') },
  { value: 'TODO', label: t('common.status.TODO') },
  { value: 'IN_PROGRESS', label: t('common.status.IN_PROGRESS') },
  { value: 'SUBMITTED', label: t('common.status.SUBMITTED') },
  { value: 'APPROVED', label: t('common.status.APPROVED') },
])

onMounted(async () => {
  locales.value = await apiFetch<Locale[]>(`/projects/${props.projectId}/locales`)
})

async function doExport() {
  exporting.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ format: format.value })
    if (selectedLocale.value) params.set('locale', selectedLocale.value)
    if (selectedStatus.value) params.set('status', selectedStatus.value)
    if (resolveRefs.value) params.set('resolve', 'true')
    if (splitByNamespace.value && format.value === 'json') params.set('splitByNamespace', 'true')

    const res = await fetch(`${apiBase}/projects/${props.projectId}/export?${params.toString()}`, {
      credentials: 'include',
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Export failed')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ext = splitByNamespace.value && format.value === 'json' ? 'zip' : format.value
    a.download = `translations.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Export failed'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="project-export-panel">
    <div class="section">
      <h3>{{ t('export.format') }}</h3>
      <div class="radio-group">
        <label v-for="f in ['json', 'csv', 'xlsx']" :key="f" class="radio-label">
          <input v-model="format" type="radio" :value="f" />
          {{ f.toUpperCase() }}
        </label>
      </div>
    </div>

    <div class="section">
      <h3>{{ t('export.filters') }}</h3>
      <div class="field">
        <label>{{ t('export.locale') }}</label>
        <LocaleSelect v-model="selectedLocale" :options="locales" clearable :clear-label="t('export.allLocales')" />
      </div>
      <div class="field">
        <label>{{ t('export.status') }}</label>
        <NbSelect v-model="selectedStatus" :options="statusOptions" />
      </div>
    </div>

    <div class="section">
      <h3>{{ t('export.options') }}</h3>
      <label class="export-option">
        <input v-model="resolveRefs" type="checkbox" />
        <span>{{ t('export.resolveRefs') }}</span>
        <span class="option-hint">{{ t('export.resolveHint') }}</span>
      </label>
      <label v-if="format === 'json'" class="export-option">
        <input v-model="splitByNamespace" type="checkbox" />
        <span>{{ t('export.splitByNamespace') }}</span>
        <span class="option-hint">{{ t('export.splitHint') }}</span>
      </label>
    </div>

    <div class="actions">
      <NbButton variant="primary" :disabled="exporting" @click="doExport">
        {{ exporting ? t('export.exporting') : t('export.submit', { format: format.toUpperCase() }) }}
      </NbButton>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<style lang="scss" scoped>
.project-export-panel {
}

.section {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
  }
}

.radio-group {
  display: flex;
  gap: 1.5rem;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 600;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  label {
    font-size: 0.85rem;
    color: #555;
    font-weight: 600;
  }
}

.actions {
  display: flex;
  gap: 0.75rem;
}

.error {
  color: #e74c3c;
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.export-option {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.option-hint {
  width: 100%;
  padding-left: 1.4rem;
  font-size: 0.78rem;
  color: #888;
  font-weight: 400;
}
</style>
