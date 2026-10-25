<template>
  <div class="project-export-panel">
    <NbPanel class="section">
      <h3>{{ t('export.format') }}</h3>
      <NbRadio
        :model-value="format"
        name="export-format"
        direction="horizontal"
        :options="formatOptions"
        @update:model-value="format = $event as ExportFormat"
      />
      <p v-if="isXliff" class="option-hint xliff-hint">{{ t('export.xliffHint') }}</p>
    </NbPanel>

    <NbPanel class="section">
      <h3>{{ t('export.filters') }}</h3>
      <div class="field">
        <LocaleSelect
          v-model="selectedLocale"
          :label="isXliff ? t('export.xliffLocale') : t('export.locale')"
          :options="locales"
          :clearable="!isXliff"
          :clear-label="t('export.allLocales')"
        />
      </div>
      <div v-if="!isXliff" class="field">
        <NbSelect v-model="selectedStatus" :label="t('export.status')" :options="statusOptions" />
      </div>
    </NbPanel>

    <NbPanel v-if="!isXliff" class="section">
      <h3>{{ t('export.options') }}</h3>
      <div class="export-option">
        <NbCheckbox v-model="resolveRefs" :label="t('export.resolveRefs')" />
        <span class="option-hint">{{ t('export.resolveHint') }}</span>
      </div>
      <div v-if="format === 'json'" class="export-option">
        <NbCheckbox v-model="splitByNamespace" :label="t('export.splitByNamespace')" />
        <span class="option-hint">{{ t('export.splitHint') }}</span>
      </div>
    </NbPanel>

    <div class="actions">
      <NbButton variant="primary" :disabled="exporting" @click="doExport">
        {{ exporting ? t('export.exporting') : t('export.submit', { format: format.toUpperCase() }) }}
      </NbButton>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiFetch } from '../api'
import LocaleSelect from './LocaleSelect.vue'
import { trackEvent } from '../composables/useAnalytics'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ projectId: string }>()
const apiBase = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000')
const { t } = useI18n()

interface Locale {
  id: string
  code: string
  name: string
}

const locales = ref<Locale[]>([])
type ExportFormat = 'json' | 'csv' | 'xlsx' | 'xliff'
const format = ref<ExportFormat>('json')
const formatOptions = (['json', 'csv', 'xlsx', 'xliff'] as const).map((f) => ({ label: f.toUpperCase(), value: f }))
const isXliff = computed(() => format.value === 'xliff')
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
  trackEvent('export_started', {
    project_id: props.projectId,
    format: format.value,
    locale: selectedLocale.value || undefined,
    status_filter: selectedStatus.value || undefined,
  })
  try {
    // XLIFF is regenerated from the imported skeleton for one specific locale.
    if (isXliff.value && !selectedLocale.value) {
      error.value = t('export.xliffLocaleRequired')
      return
    }
    const params = new URLSearchParams({ format: format.value })
    if (selectedLocale.value) params.set('locale', selectedLocale.value)
    if (selectedStatus.value && !isXliff.value) params.set('status', selectedStatus.value)
    if (resolveRefs.value && !isXliff.value) params.set('resolve', 'true')
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
    a.download = isXliff.value ? `${selectedLocale.value}.xliff` : `translations.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Export failed'
    trackEvent('export_failed', {
      project_id: props.projectId,
      format: format.value,
      reason: error.value.slice(0, 200),
    })
  } finally {
    exporting.value = false
  }
}
</script>

<style lang="scss" scoped>
.section {
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--nb-c-text-muted);
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
}

.error {
  color: var(--nb-c-status-error);
  margin: 0.5rem 0;
  font-size: 0.9rem;
}

.export-option {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
}

.option-hint {
  padding-left: 1.75rem;
  font-size: 0.78rem;
  color: var(--nb-c-text-subtle);
  font-weight: 400;
}
</style>
