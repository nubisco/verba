<template>
  <!-- Topbar: teleported into #verba-topbar -->
  <Teleport defer to="#verba-topbar">
    <NbGrid align="center" gap="md">
      <span v-if="!loading" class="topbar-meta">{{ t('keys.list.total', { count: total }) }}</span>
      <NbTextInput
        :v-model="search"
        type="search"
        size="sm"
        :placeholder="t('keys.list.search')"
        @input="onSearchInput(($event.target as HTMLInputElement).value)"
      >
        <template #leading>
          <NbIcon name="magnifying-glass" :size="16" color="#6b7280" style="margin-left: 12px" />
        </template>
      </NbTextInput>
      <NbButton variant="primary" @click="showCreate = !showCreate">
        {{ showCreate ? t('common.cancel') : t('keys.list.newKey') }}
      </NbButton>
    </NbGrid>
  </Teleport>

  <!-- Inspector: teleported into #verba-inspector -->
  <Teleport defer to="#verba-inspector">
    <div v-if="selectedKeyId" class="key-inspector-wrap">
      <NbGrid justify="between" class="inspector-header-ctrl">
        <NbButton variant="secondary" @click="selectedKeyId = null">
          {{ t('common.back') }}
        </NbButton>
        <NbButton class="inspector-close-btn" title="Close" @click="selectedKeyId = null">✕</NbButton>
      </NbGrid>
      <KeyDetailPanel
        :key="selectedKeyId"
        :project-id="projectId"
        :key-id="selectedKeyId"
        compact
        @deleted="
          () => {
            selectedKeyId = null
            fetchKeys()
          }
        "
      />
    </div>
  </Teleport>

  <!-- Main content -->
  <NbGrid dir="col" gap="md" class="key-list-view">
    <h2>{{ t('keys.list.title') }}</h2>
    <!-- Create Key form -->
    <div v-if="showCreate" class="create-form card">
      <h3>{{ t('keys.create.title') }}</h3>
      <div class="form-row">
        <div class="field">
          <label>{{ t('keys.create.name') }}</label>
          <NbTextInput
            v-model="newKeyName"
            :placeholder="t('keys.create.namePlaceholder')"
            @keydown.enter.prevent="createKey"
          />
        </div>
        <div class="field">
          <label>{{ t('keys.create.namespace') }}</label>
          <NbSelect v-model="newKeyNs" :options="nsSelectOptions" />
        </div>
      </div>
      <div class="field">
        <label>{{ t('keys.create.description') }}</label>
        <NbTextInput v-model="newKeyDesc" :placeholder="t('keys.create.descriptionPlaceholder')" />
      </div>
      <div class="form-actions">
        <NbButton variant="primary" :disabled="creating" @click="createKey">
          {{ creating ? t('keys.create.submitting') : t('keys.create.submit') }}
        </NbButton>
        <span v-if="createError" class="field-error">{{ createError }}</span>
      </div>
      <p v-if="namespaces.length === 0" class="warn-note">
        {{ t('keys.list.noNamespacesWarning') }}
        <RouterLink :to="`/projects/${projectId}`">{{ t('keys.list.goToSettings') }}</RouterLink>
        to add one.
      </p>
    </div>

    <!-- Namespace tabs -->
    <div v-if="namespaces.length > 0" class="ns-tabs">
      <NbButton class="ns-tab" :class="{ active: filterNamespace === '' }" @click="selectNamespace('')">
        {{ t('common.all') }}
      </NbButton>
      <NbButton
        v-for="ns in namespaces"
        :key="ns.id"
        class="ns-tab"
        :class="{ active: filterNamespace === ns.id }"
        @click="selectNamespace(ns.id)"
      >
        {{ ns.slug }}
      </NbButton>
    </div>

    <!-- Search moved to topbar -->

    <div v-if="loading" class="skeleton-list">
      <div v-for="n in 8" :key="n" class="skeleton-row" />
    </div>

    <div v-else-if="keys.length === 0" class="empty-state">
      <p>{{ search ? t('keys.list.noMatch') : t('keys.list.empty') }}</p>
      <NbButton v-if="!search" variant="primary" @click="showCreate = true">
        {{ t('keys.list.createFirst') }}
      </NbButton>
    </div>

    <div v-else class="table-container">
      <table class="keys-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Namespace</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="key in keys"
            :key="key.id"
            class="key-row"
            :class="{ selected: selectedKeyId === key.id }"
            @click="selectedKeyId = key.id"
          >
            <td class="key-name">
              {{ key.fullKey ?? key.name }}
              <span v-if="key.description" class="key-desc">{{ key.description }}</span>
            </td>
            <td>
              <span class="ns-tag">{{ nsLabel(key.namespaceId) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="total > limit" class="pagination">
      <NbButton :disabled="page <= 1" @click="prevPage">← Prev</NbButton>
      <span class="page-info">{{ pageInfo }}</span>
      <NbButton :disabled="page >= totalPages" @click="nextPage">Next →</NbButton>
    </div>
  </NbGrid>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'
import { useLayoutSlots } from '../composables/useLayoutSlots'
import KeyDetailPanel from '../components/KeyDetailPanel.vue'
import { NbTextInput, NbSelect, type NbSelectOption } from '@nubisco/ui'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const { t } = useI18n()
const { openInspector, closeInspector } = useLayoutSlots()

interface Key {
  id: string
  name: string
  fullKey?: string
  namespaceId: string
  description?: string
}
interface Namespace {
  id: string
  name: string
  slug: string
}
interface KeyPage {
  items: Key[]
  total: number
  page: number
  limit: number
}

const keys = ref<Key[]>([])
const total = ref(0)
const namespaces = ref<Namespace[]>([])
const loading = ref(true)
const limit = 50
const selectedKeyId = ref<string | null>(null)

const nsSelectOptions = computed<NbSelectOption[]>(() =>
  namespaces.value.map((ns) => ({ label: ns.slug, value: ns.id })),
)

// Filters: initialised from URL query params
const page = ref(Number(route.query.page) || 1)
const filterNamespace = ref((route.query.ns as string) || '')
const search = ref((route.query.q as string) || '')

// Debounced search
let searchTimer: ReturnType<typeof setTimeout>
function onSearchInput(val: string) {
  search.value = val
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchKeys()
  }, 300)
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const pageInfo = computed(() => {
  const start = (page.value - 1) * limit + 1
  const end = Math.min(page.value * limit, total.value)
  return total.value === 0 ? 'No results' : `${start}-${end} of ${total.value}`
})

function nsLabel(id: string) {
  return namespaces.value.find((n) => n.id === id)?.slug ?? id
}

// Sync active filters to URL
function syncUrl() {
  const q: Record<string, string> = {}
  if (page.value > 1) q.page = String(page.value)
  if (filterNamespace.value) q.ns = filterNamespace.value
  if (search.value) q.q = search.value
  router.replace({ query: q })
}

async function fetchKeys() {
  loading.value = true
  syncUrl()
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(limit),
    })
    if (filterNamespace.value) params.set('namespaceId', filterNamespace.value)
    if (search.value) params.set('search', search.value)
    const result = await apiFetch<KeyPage>(`/projects/${projectId}/keys?${params}`)
    keys.value = result.items
    total.value = result.total
  } finally {
    loading.value = false
  }
}

// Create key form
const showCreate = ref(false)
const newKeyName = ref('')
const newKeyNs = ref('')
const newKeyDesc = ref('')
const creating = ref(false)
const createError = ref('')

async function createKey() {
  createError.value = ''
  if (!newKeyName.value.trim()) {
    createError.value = 'Key name is required'
    return
  }
  if (!newKeyNs.value) {
    createError.value = 'Namespace is required'
    return
  }
  creating.value = true
  try {
    const key = await apiFetch<Key>(`/projects/${projectId}/keys`, {
      method: 'POST',
      body: JSON.stringify({
        name: newKeyName.value.trim(),
        namespaceId: newKeyNs.value,
        description: newKeyDesc.value.trim() || undefined,
      }),
    })
    keys.value.unshift(key)
    total.value++
    newKeyName.value = ''
    newKeyDesc.value = ''
    showCreate.value = false
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Failed to create key'
  } finally {
    creating.value = false
  }
}

function selectNamespace(id: string) {
  filterNamespace.value = id
  page.value = 1
  fetchKeys()
}

function prevPage() {
  if (page.value > 1) {
    page.value--
    fetchKeys()
  }
}
function nextPage() {
  if (page.value < totalPages.value) {
    page.value++
    fetchKeys()
  }
}

onMounted(async () => {
  const [ns] = await Promise.all([apiFetch<Namespace[]>(`/projects/${projectId}/namespaces`), fetchKeys()])
  namespaces.value = ns
  if (ns.length > 0 && !newKeyNs.value) newKeyNs.value = ns[0].id
})

watch(selectedKeyId, (id) => {
  if (id) openInspector()
  else closeInspector()
})

onUnmounted(() => closeInspector())
</script>

<style lang="scss" scoped>
.key-list-view {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

// Controls rendered inside #verba-inspector via Teleport
.key-inspector-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.inspector-header-ctrl {
  display: flex;
  justify-content: flex-end;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.inspector-close-btn {
  background: none;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.45rem;
  color: #555;
  line-height: 1;
  &:hover {
    background: #f0f0f0;
  }
}

.card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
  }
}

.create-form {
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #555;
    }
  }
  .form-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
}

.field-error {
  color: #c0392b;
  font-size: 0.82rem;
}
.warn-note {
  font-size: 0.82rem;
  color: #b96a00;
  margin-top: 0.75rem;
  a {
    color: #1a1a2e;
  }
}

/* Namespace tabs */
.ns-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.ns-tab {
  padding: 0.3rem 0.85rem;
  border-radius: 999px;
  border: 1px solid #d0d0d0;
  background: #fff;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  color: #555;
  transition: all 0.12s;
  &:hover {
    background: #f0f0f5;
    border-color: #aaa;
  }
  &.active {
    background: #1a1a2e;
    color: #fff;
    border-color: #1a1a2e;
  }
}

.ns-tag {
  font-size: 0.78rem;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

/* Table container with sticky header */
.table-container {
  overflow-y: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
}

.keys-table {
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: 0.75rem 1rem;
    text-align: left;
    font-size: 0.875rem;
  }
  th {
    background: #f7f7f9;
    font-weight: 600;
    color: #555;
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e0e0e0;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  tr + tr td {
    border-top: 1px solid #f0f0f0;
  }

  .key-row {
    cursor: pointer;
    transition: background 0.12s;
    &:hover td {
      background: #f5f5ff;
    }
    &.selected td {
      background: #ede9fe;
      border-left: 3px solid #5b21b6;
    }
  }
}

.key-name {
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  .key-desc {
    display: block;
    font-family: inherit;
    font-size: 0.78rem;
    color: #888;
    margin-top: 0.15rem;
    font-style: italic;
  }
}

.link {
  color: #1a1a2e;
  font-size: 0.85rem;
  text-decoration: none;
  font-weight: 500;
  &:hover {
    text-decoration: underline;
  }
}

.pagination {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  button {
    padding: 0.4rem 0.85rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    &:hover:not(:disabled) {
      background: #f0f0f0;
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
  .page-info {
    color: #666;
  }
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.skeleton-row {
  height: 44px;
  background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.empty-state {
  padding: 2.5rem;
  text-align: center;
  color: #888;
  background: #fff;
  border-radius: 8px;
  border: 1px dashed #d0d0d0;
}
</style>
