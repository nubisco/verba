<template>
  <div class="project-import-panel">
    <NbPanel class="section">
      <NbFileUploader
        :heading="t('import.selectFile')"
        :description="t('import.uploaderDescription')"
        button-label="Add file"
        accept=".xlsx,.csv,.json,.xliff,.xlf"
        :max-size="512000"
        @change="onFileChange"
      />
    </NbPanel>

    <NbPanel v-if="isXliffFile" class="section json-info">
      <div class="json-detected">{{ t('import.xliffDetected') }}</div>
    </NbPanel>

    <NbPanel v-if="isJsonFile" class="section json-info">
      <h3>{{ t('import.columnMapping') }}</h3>
      <div v-if="detectedJsonLocales.length > 0" class="json-detected">
        ✅ Multi-locale JSON detected. Locales found:
        <strong>{{ detectedJsonLocales.join(', ') }}</strong>
      </div>
      <div v-else class="field">
        <NbSelect
          v-model="jsonSingleLocale"
          label="Single-locale JSON: select the target locale:"
          :options="jsonLocaleOptions"
        />
      </div>
    </NbPanel>

    <NbPanel v-else-if="!isXliffFile" class="section">
      <h3>{{ t('import.columnMapping') }}</h3>
      <div class="field">
        <NbTextInput v-model="keyColumn" :label="t('import.keyColumn')" placeholder="key" />
      </div>
      <div class="field">
        <NbTextInput v-model="namespaceColumn" :label="t('import.namespaceColumn')" placeholder="namespace" />
      </div>
      <div v-for="locale in locales" :key="locale.code" class="field">
        <LocaleBadge :code="locale.code" class="field-locale" />
        <NbTextInput
          v-model="localeColumnMap[locale.code]"
          :label="`${locale.name} column`"
          :placeholder="locale.code"
        />
      </div>
    </NbPanel>

    <div class="actions">
      <NbButton :disabled="loading" @click="doPreview">
        {{ loading ? t('common.loading') : t('import.preview') }}
      </NbButton>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <NbPanel v-if="preview" class="section preview">
      <h3>{{ t('import.previewTitle') }}</h3>
      <div class="counts">
        <NbBadge variant="green">{{ t('import.create', { count: preview.created }) }}</NbBadge>
        <NbBadge variant="orange">{{ t('import.update', { count: preview.updated }) }}</NbBadge>
        <NbBadge>{{ t('import.skip', { count: preview.skipped }) }}</NbBadge>
      </div>
      <div v-if="preview.targetLanguage" class="xliff-meta">
        {{ t('import.xliffTarget', { source: preview.sourceLanguage, target: preview.targetLanguage }) }}
      </div>
      <NbBanner
        v-if="preview.warnings && preview.warnings.length"
        status="warning"
        :title="t('import.placeholderWarnings', { count: preview.warnings.length })"
        class="warnings"
      >
        <ul>
          <li v-for="w in preview.warnings.slice(0, 10)" :key="w.id">
            <code>{{ w.id }}</code
            >: {{ w.message }}
          </li>
        </ul>
      </NbBanner>
      <NbDataTable
        :columns="previewColumns"
        :rows="preview.rows.slice(0, 10)"
        row-key="keyName"
        size="sm"
        aria-label="Import preview"
        stack-on-phone
      >
        <template #cell-status="{ row }">
          <NbBadge :variant="PREVIEW_STATUS_BADGE[row.status]">{{ row.status }}</NbBadge>
        </template>
        <template #cell-changes="{ row }">
          <span v-for="c in row.localeChanges" :key="c.localeCode" class="change">
            {{ c.localeCode }}: {{ c.oldText ?? '∅' }} → {{ c.newText }}
          </span>
        </template>
      </NbDataTable>
      <div class="actions">
        <NbButton variant="primary" :disabled="loading" @click="doApply">
          {{ loading ? t('import.applying') : t('import.applyImport') }}
        </NbButton>
      </div>
    </NbPanel>

    <NbPanel v-if="applyResult" class="section result">
      <h3>{{ t('import.importComplete') }}</h3>
      <!-- A well one step above the panel it sits in. -->
      <NbLayer as="pre" class="result-stats">{{ JSON.stringify(applyResult.stats, null, 2) }}</NbLayer>
      <NbButton
        variant="secondary"
        :to="`/projects/${projectId}/import-runs/${applyResult.importRunId}`"
        class="import-run-link"
      >
        {{ t('import.viewImportRun') }}
      </NbButton>

      <div v-if="isXliffFile && xliffTargetLocale" class="ai-fill">
        <p class="ai-fill-hint">{{ t('import.aiFillHint', { locale: xliffTargetLocale }) }}</p>
        <NbButton variant="primary" :disabled="aiFilling" @click="aiFill">
          {{ aiFilling ? t('import.aiFilling') : t('import.aiFill', { locale: xliffTargetLocale }) }}
        </NbButton>
        <div v-if="aiFillError" class="error">{{ aiFillError }}</div>
        <div v-if="aiFillResult" class="ai-fill-result">
          {{ t('import.aiFillResult', { filled: aiFillResult.filled, skipped: aiFillResult.skipped }) }}
          <ul v-if="aiFillResult.warnings.length">
            <li v-for="w in aiFillResult.warnings.slice(0, 10)" :key="w.key">
              <code>{{ w.key }}</code
              >: {{ w.message }}
            </li>
          </ul>
        </div>
      </div>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiFetch } from '../api'
import { trackEvent } from '../composables/useAnalytics'
import { useI18n } from 'vue-i18n'
import { type IDataTableColumn, type ISelectOption } from '@nubisco/ui'
import LocaleBadge from './LocaleBadge.vue'

const props = defineProps<{ projectId: string }>()
const apiBase = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000')
const { t } = useI18n()

interface Locale {
  id: string
  code: string
  name: string
}
interface PreviewRow {
  keyName: string
  status: 'create' | 'update' | 'skip'
  localeChanges: {
    localeCode: string
    oldText: string | null
    newText: string
  }[]
}
interface PreviewResult {
  created: number
  updated: number
  skipped: number
  rows: PreviewRow[]
  // XLIFF-specific fields (present only for .xliff uploads)
  format?: string
  targetLanguage?: string
  sourceLanguage?: string
  warnings?: { id: string; message: string }[]
}

const locales = ref<Locale[]>([])
const file = ref<File | null>(null)
const isJsonFile = ref(false)
const isXliffFile = ref(false)
const jsonSingleLocale = ref('')
const detectedJsonLocales = ref<string[]>([])
const keyColumn = ref('key')
const namespaceColumn = ref('')
const localeColumnMap = ref<Record<string, string>>({})
const preview = ref<PreviewResult | null>(null)
const previewColumns: IDataTableColumn<PreviewRow>[] = [
  { key: 'keyName', header: 'Key', primary: true },
  { key: 'status', header: 'Status' },
  { key: 'changes', header: 'Changes' },
]
const PREVIEW_STATUS_BADGE: Record<PreviewRow['status'], 'green' | 'orange' | 'grey'> = {
  create: 'green',
  update: 'orange',
  skip: 'grey',
}
const applyResult = ref<{ importRunId: string; stats: object } | null>(null)
const loading = ref(false)
const error = ref('')

// AI batch-fill of the just-imported XLIFF locale.
const xliffTargetLocale = ref('')
const aiFilling = ref(false)
const aiFillResult = ref<{ filled: number; skipped: number; warnings: { key: string; message: string }[] } | null>(null)
const aiFillError = ref('')

const jsonLocaleOptions = computed<ISelectOption[]>(() => [
  { label: ': select locale : ', value: '' },
  ...locales.value.map((l) => ({
    label: `${l.code} (${l.name})`,
    value: l.code,
  })),
])

onMounted(async () => {
  locales.value = await apiFetch<Locale[]>(`/projects/${props.projectId}/locales`)
  for (const l of locales.value) {
    localeColumnMap.value[l.code] = l.code
  }
})

async function onFileChange(incoming: File[]) {
  const f = incoming[0] ?? null
  file.value = f
  detectedJsonLocales.value = []
  jsonSingleLocale.value = ''
  const name = (f?.name ?? '').toLowerCase()

  if (f && (name.endsWith('.xliff') || name.endsWith('.xlf'))) {
    // XLIFF is self-describing: locales, keys, notes and states are embedded.
    isXliffFile.value = true
    isJsonFile.value = false
  } else if (f && name.endsWith('.json')) {
    isXliffFile.value = false
    isJsonFile.value = true
    try {
      const text = await f.text()
      const raw = JSON.parse(text)
      const firstVal = Object.values(raw)[0]
      if (typeof firstVal === 'object' && firstVal !== null) {
        detectedJsonLocales.value = Object.keys(raw)
      }
    } catch {
      /* server will report parse errors */
    }
  } else {
    isXliffFile.value = false
    isJsonFile.value = false
  }
}

function buildFormData() {
  let mapping: Record<string, unknown>
  if (isXliffFile.value) {
    // Server infers everything from the XLIFF; mapping is unused but harmless.
    mapping = { keyColumn: 'id', localeColumns: {} }
  } else if (isJsonFile.value) {
    const localeColumns: Record<string, string> = {}
    if (detectedJsonLocales.value.length === 0 && jsonSingleLocale.value) {
      localeColumns[jsonSingleLocale.value] = '__json__'
    }
    mapping = { keyColumn: 'key', localeColumns }
  } else {
    mapping = {
      keyColumn: keyColumn.value,
      localeColumns: { ...localeColumnMap.value },
    }
    if (namespaceColumn.value) mapping.namespaceColumn = namespaceColumn.value
  }
  const fd = new FormData()
  fd.append('file', file.value!)
  fd.append('mapping', JSON.stringify(mapping))
  return fd
}

async function doPreview() {
  if (!file.value) {
    error.value = 'Please select a file'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${apiBase}/projects/${props.projectId}/import/preview`, {
      method: 'POST',
      body: buildFormData(),
      credentials: 'include',
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? 'Preview failed')
    }
    preview.value = await res.json()
    applyResult.value = null
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function doApply() {
  if (!file.value) {
    error.value = 'Please select a file'
    return
  }
  loading.value = true
  error.value = ''
  trackEvent('import_started', {
    project_id: props.projectId,
    file_type: file.value.type || file.value.name.split('.').pop(),
  })
  try {
    const res = await fetch(`${apiBase}/projects/${props.projectId}/import/apply`, {
      method: 'POST',
      body: buildFormData(),
      credentials: 'include',
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? 'Apply failed')
    }
    applyResult.value = await res.json()
    xliffTargetLocale.value = preview.value?.targetLanguage ?? ''
    aiFillResult.value = null
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function aiFill() {
  if (!xliffTargetLocale.value) return
  aiFilling.value = true
  aiFillError.value = ''
  try {
    aiFillResult.value = await apiFetch(`/projects/${props.projectId}/ai/fill-locale`, {
      method: 'POST',
      body: JSON.stringify({ localeCode: xliffTargetLocale.value, onlyEmpty: true }),
    })
  } catch (e: unknown) {
    aiFillError.value = e instanceof Error ? e.message : String(e)
  } finally {
    aiFilling.value = false
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
  margin-bottom: 0.75rem;
}
.field-locale {
  margin-bottom: 0.3rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.error {
  color: var(--nb-c-status-error);
  margin: 0.5rem 0;
}

.counts {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.change {
  display: inline-block;
  margin-right: 0.5rem;
  font-size: 0.8rem;
  color: var(--nb-c-text-muted);
}

.json-detected {
  font-size: 0.9rem;
  color: var(--nb-c-status-valid);
}

.xliff-meta {
  font-size: 0.85rem;
  color: var(--nb-c-text-muted);
  margin-bottom: 0.75rem;
}

.warnings {
  margin-bottom: 1rem;
  ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
  }
  code {
    font-family: var(--nb-font-family-mono);
  }
}

.result-stats {
  background: var(--nb-c-surface);
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
  overflow: auto;
}

.ai-fill {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--nb-c-border);
}
.ai-fill-hint {
  font-size: 0.85rem;
  color: var(--nb-c-text-muted);
  margin: 0 0 0.6rem;
}
.ai-fill-result {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: var(--nb-c-text);
  ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
    color: var(--nb-c-status-warning);
  }
  code {
    font-family: var(--nb-font-family-mono);
  }
}
.import-run-link {
  margin-top: 0.75rem;
}
</style>
