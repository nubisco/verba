<template>
  <!-- Inspector: teleported into #verba-inspector -->
  <Teleport defer to="#verba-inspector">
    <div v-if="selectedKeyId" class="key-inspector-wrap">
      <NbGrid justify="between" class="inspector-header-ctrl">
        <NbButton variant="secondary" @click="selectedKeyId = null">
          {{ t('common.back') }}
        </NbButton>
        <NbButton
          variant="ghost"
          size="sm"
          icon="x"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="selectedKeyId = null"
        />
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
    <!-- Topbar: teleported into #verba-topbar. On a phone it stays here, under
           the title, where the search and New Key fit without scrolling sideways. -->
    <Teleport defer to="#verba-topbar" :disabled="phone">
      <NbGrid align="center" gap="md" class="keys-toolbar">
        <span v-if="!loading" class="topbar-meta">{{ t('keys.list.total', { count: total }) }}</span>
        <NbTextInput
          :v-model="search"
          type="search"
          size="sm"
          :placeholder="t('keys.list.search')"
          @input="onSearchInput(($event.target as HTMLInputElement).value)"
        >
          <template #leading>
            <NbIcon name="magnifying-glass" :size="16" color="var(--nb-c-text-subtle)" style="margin-left: 12px" />
          </template>
        </NbTextInput>
        <NbButton variant="primary" @click="showCreate = !showCreate">
          {{ showCreate ? t('common.cancel') : t('keys.list.newKey') }}
        </NbButton>
      </NbGrid>
    </Teleport>
    <!-- Create Key form -->
    <NbPanel v-if="showCreate" class="create-form">
      <h3>{{ t('keys.create.title') }}</h3>
      <div class="form-row">
        <NbTextInput
          v-model="newKeyName"
          :label="t('keys.create.name')"
          :placeholder="t('keys.create.namePlaceholder')"
          @keydown.enter.prevent="createKey"
        />
        <NbSelect v-model="newKeyNs" :label="t('keys.create.namespace')" :options="nsSelectOptions" />
      </div>
      <NbTextInput
        v-model="newKeyDesc"
        class="field"
        :label="t('keys.create.description')"
        :placeholder="t('keys.create.descriptionPlaceholder')"
      />
      <div class="form-actions">
        <NbButton variant="primary" :disabled="creating" @click="createKey">
          {{ creating ? t('keys.create.submitting') : t('keys.create.submit') }}
        </NbButton>
        <span v-if="createError" class="field-error">{{ createError }}</span>
      </div>
      <p v-if="namespaces.length === 0" class="warn-note">
        {{ t('keys.list.noNamespacesWarning') }}
        <NbButton variant="link" :to="`/projects/${projectId}`">{{ t('keys.list.goToSettings') }}</NbButton>
        to add one.
      </p>
    </NbPanel>

    <!-- Namespace tabs -->
    <NbTabs
      v-if="namespaces.length > 0"
      :model-value="filterNamespace || ALL_NAMESPACES"
      :items="nsTabs"
      :aria-label="t('keys.create.namespace')"
      class="ns-tabs"
      @update:model-value="selectNamespace($event === ALL_NAMESPACES ? '' : $event)"
    />

    <!-- Search moved to topbar -->

    <NbDataTable
      :columns="keyColumns"
      :rows="keys"
      row-key="id"
      selectable="single"
      :selected="selectedKeyId ? [selectedKeyId] : []"
      :loading="loading"
      :skeleton-rows="8"
      aria-label="Translation keys"
      stack-on-phone
      class="keys-table"
      @row-click="(row: Key) => (selectedKeyId = row.id)"
      @update:selected="(ids: (string | number)[]) => (selectedKeyId = ids.length ? String(ids[0]) : null)"
    >
      <template #cell-name="{ row }">
        <span class="key-name">
          {{ row.fullKey ?? row.name }}
          <span v-if="row.description" class="key-desc">{{ row.description }}</span>
        </span>
      </template>
      <template #cell-namespace="{ row }">
        <NbBadge variant="primary">{{ nsLabel(row.namespaceId) }}</NbBadge>
      </template>
      <template #empty>
        <NbEmptyState
          :kind="search ? 'no-results' : 'empty'"
          :title="search ? t('keys.list.noMatch') : t('keys.list.empty')"
        >
          <template v-if="!search" #actions>
            <NbButton variant="primary" @click="showCreate = true">
              {{ t('keys.list.createFirst') }}
            </NbButton>
          </template>
        </NbEmptyState>
      </template>
      <template v-if="total > limit" #footer>
        <NbPagination :page="page" :page-size="limit" :total="total" @update:page="goToPage" />
      </template>
    </NbDataTable>
  </NbGrid>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'
import { useLayoutSlots } from '../composables/useLayoutSlots'
import KeyDetailPanel from '../components/KeyDetailPanel.vue'
import { NbTextInput, NbSelect, usePhoneLayout, type IDataTableColumn, type ISelectOption } from '@nubisco/ui'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const { t } = useI18n()
const { openInspector, closeInspector } = useLayoutSlots()
const { phone } = usePhoneLayout()

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

const nsSelectOptions = computed<ISelectOption[]>(() =>
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

const ALL_NAMESPACES = '__all__'
const nsTabs = computed(() => [
  { id: ALL_NAMESPACES, label: t('common.all') },
  ...namespaces.value.map((ns) => ({ id: ns.id, label: ns.slug })),
])

const keyColumns: IDataTableColumn<Key>[] = [
  { key: 'name', header: 'Key', primary: true },
  { key: 'namespace', header: 'Namespace', width: '200px' },
]

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

function goToPage(next: number) {
  page.value = Math.min(Math.max(1, next), totalPages.value)
  fetchKeys()
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
// On a phone the toolbar renders in the page (see the Teleport), so it wraps
// and the search takes a full row.
@include variables.phone {
  .keys-toolbar {
    flex-wrap: wrap;

    :deep(.nb-text-input) {
      flex: 1 1 100%;
    }
  }
}

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
  border-bottom: 1px solid var(--nb-c-border);
  flex-shrink: 0;
}

.create-form {
  padding: 1.25rem 1.5rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--nb-c-text-muted);
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .field {
    margin-bottom: 0.75rem;
  }
  .form-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
}

.field-error {
  color: var(--nb-c-status-error);
  font-size: 0.82rem;
}
.warn-note {
  font-size: 0.82rem;
  color: var(--nb-c-status-warning);
  margin-top: 0.75rem;
  a {
    color: var(--nb-c-text);
  }
}

.key-name {
  font-family: var(--nb-font-family-mono);
  font-size: 0.85rem;
  .key-desc {
    display: block;
    font-family: inherit;
    font-size: 0.78rem;
    color: var(--nb-c-text-subtle);
    margin-top: 0.15rem;
    font-style: italic;
  }
}
</style>
