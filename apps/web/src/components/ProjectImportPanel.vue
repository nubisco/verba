<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'
import { type NbSelectOption } from '@nubisco/ui'
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
}

const locales = ref<Locale[]>([])
const file = ref<File | null>(null)
const isJsonFile = ref(false)
const jsonSingleLocale = ref('')
const detectedJsonLocales = ref<string[]>([])
const keyColumn = ref('key')
const namespaceColumn = ref('')
const localeColumnMap = ref<Record<string, string>>({})
const preview = ref<PreviewResult | null>(null)
const applyResult = ref<{ importRunId: string; stats: object } | null>(null)
const loading = ref(false)
const error = ref('')

const jsonLocaleOptions = computed<NbSelectOption[]>(() => [
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

  if (f && f.name.endsWith('.json')) {
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
    isJsonFile.value = false
  }
}

function buildFormData() {
  let mapping: Record<string, unknown>
  if (isJsonFile.value) {
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
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="project-import-panel">
    <div class="section">
      <NbFileUploader
        :heading="t('import.selectFile')"
        description="Max file size is 500 KB. Supported file types are .xlsx, .csv, and .json."
        button-label="Add file"
        accept=".xlsx,.csv,.json"
        :max-size="512000"
        @change="onFileChange"
      />
    </div>

    <div v-if="isJsonFile" class="section json-info">
      <h3>{{ t('import.columnMapping') }}</h3>
      <div v-if="detectedJsonLocales.length > 0" class="json-detected">
        ✅ Multi-locale JSON detected. Locales found:
        <strong>{{ detectedJsonLocales.join(', ') }}</strong>
      </div>
      <div v-else class="field">
        <label>
          Single-locale JSON: select the target locale:
          <NbSelect v-model="jsonSingleLocale" :options="jsonLocaleOptions" />
        </label>
      </div>
    </div>

    <div v-else class="section">
      <h3>{{ t('import.columnMapping') }}</h3>
      <div class="field">
        <label>{{ t('import.keyColumn') }}</label>
        <NbTextInput v-model="keyColumn" placeholder="key" />
      </div>
      <div class="field">
        <label>{{ t('import.namespaceColumn') }}</label>
        <NbTextInput v-model="namespaceColumn" placeholder="namespace" />
      </div>
      <div v-for="locale in locales" :key="locale.code" class="field">
        <label><LocaleBadge :code="locale.code" /> {{ locale.name }} column</label>
        <NbTextInput v-model="localeColumnMap[locale.code]" :placeholder="locale.code" />
      </div>
    </div>

    <div class="actions">
      <NbButton :disabled="loading" @click="doPreview">
        {{ loading ? t('common.loading') : t('import.preview') }}
      </NbButton>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="preview" class="section preview">
      <h3>{{ t('import.previewTitle') }}</h3>
      <div class="counts">
        <span class="badge create">{{ t('import.create', { count: preview.created }) }}</span>
        <span class="badge update">{{ t('import.update', { count: preview.updated }) }}</span>
        <span class="badge skip">{{ t('import.skip', { count: preview.skipped }) }}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Status</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in preview.rows.slice(0, 10)" :key="row.keyName">
            <td>{{ row.keyName }}</td>
            <td>
              <span :class="['badge', row.status]">{{ row.status }}</span>
            </td>
            <td>
              <span v-for="c in row.localeChanges" :key="c.localeCode" class="change">
                {{ c.localeCode }}: {{ c.oldText ?? '∅' }} → {{ c.newText }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="actions">
        <NbButton variant="primary" :disabled="loading" @click="doApply">
          {{ loading ? t('import.applying') : t('import.applyImport') }}
        </NbButton>
      </div>
    </div>

    <div v-if="applyResult" class="section result">
      <h3>{{ t('import.importComplete') }}</h3>
      <pre>{{ JSON.stringify(applyResult.stats, null, 2) }}</pre>
      <RouterLink :to="`/projects/${projectId}/import-runs/${applyResult.importRunId}`" class="nav-link">
        {{ t('import.viewImportRun') }}
      </RouterLink>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.project-import-panel {
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

.field {
  margin-bottom: 0.75rem;
  label {
    display: block;
    font-size: 0.9rem;
    margin-bottom: 0.3rem;
  }
}

.actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.error {
  color: #e74c3c;
  margin: 0.5rem 0;
}

.counts {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  &.create {
    background: #d5f5e3;
    color: #27ae60;
  }
  &.update {
    background: #fef9e7;
    color: #e67e22;
  }
  &.skip {
    background: #f0f0f0;
    color: #888;
  }
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #eee;
  }
}

.change {
  display: inline-block;
  margin-right: 0.5rem;
  font-size: 0.8rem;
  color: #555;
}

pre {
  background: #f7f7f9;
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
  overflow: auto;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #f7f7f9;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  text-decoration: none;
  color: #1a1a2e;
  font-size: 0.9rem;
  margin-top: 0.75rem;
  &:hover {
    background: #eee;
  }
}
</style>
