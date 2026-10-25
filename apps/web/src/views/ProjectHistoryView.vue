<template>
  <div class="tab-content">
    <NbDataTable
      title="Project History"
      :columns="columns"
      :rows="rows"
      row-key="id"
      size="sm"
      :loading="historyLoading && historyEntries.length === 0"
      :skeleton-rows="5"
      empty-message="No history yet"
      stack-on-phone
      class="history-table"
    >
      <template #cell-action="{ value }">
        <code class="action-code">{{ value }}</code>
      </template>
      <template #cell-entityType="{ value }">
        <NbBadge variant="primary">{{ value }}</NbBadge>
      </template>
      <template v-if="historyHasMore" #footer>
        <div class="load-more">
          <NbButton outlined :disabled="historyLoading" @click="loadMore">
            {{ historyLoading ? 'Loading…' : `Load more (${historyTotal - historyEntries.length} remaining)` }}
          </NbButton>
        </div>
      </template>
    </NbDataTable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { apiFetch } from '../api'
import type { IDataTableColumn } from '@nubisco/ui'
import { historyRows, type HistoryEntry } from '../utils/history'

const route = useRoute()
const projectId = route.params.id as string
void useProjectStore()

const historyEntries = ref<HistoryEntry[]>([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyLimit = 50
const historyLoading = ref(false)
const historyHasMore = computed(() => historyEntries.value.length < historyTotal.value)

async function loadHistory(reset = false) {
  if (reset) {
    historyPage.value = 1
    historyEntries.value = []
  }
  historyLoading.value = true
  try {
    const res = await apiFetch<{ items: HistoryEntry[]; total: number }>(
      `/projects/${projectId}/history?page=${historyPage.value}&limit=${historyLimit}`,
    )
    if (reset) historyEntries.value = res.items
    else historyEntries.value.push(...res.items)
    historyTotal.value = res.total
  } finally {
    historyLoading.value = false
  }
}

function loadMore() {
  historyPage.value++
  loadHistory()
}

const columns: IDataTableColumn[] = [
  { key: 'action', header: 'Action', primary: true },
  { key: 'entityType', header: 'Entity' },
  { key: 'user', header: 'User' },
  { key: 'date', header: 'Date', cellClass: 'time-cell', phoneMeta: true },
]
const rows = computed(() => historyRows(historyEntries.value))

onMounted(() => loadHistory(true))
</script>

<style lang="scss" scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.history-table :deep(.time-cell) {
  color: var(--nb-c-text-subtle);
  white-space: nowrap;
}
.action-code {
  font-size: 0.8rem;
  color: var(--nb-c-primary);
  background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}
.load-more {
  padding: 1rem 1.5rem;
}
</style>
