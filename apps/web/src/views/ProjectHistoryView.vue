<template>
  <div class="tab-content">
    <div class="section history-section">
      <h3>Project History</h3>
      <div v-if="historyLoading && historyEntries.length === 0" class="empty-note">Loading…</div>
      <div v-else-if="historyEntries.length === 0" class="empty-note">No history yet</div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Entity</th>
              <th>User</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in historyEntries" :key="entry.id">
              <td>
                <code class="action-code">{{ entry.action }}</code>
              </td>
              <td>
                <span class="entity-type">{{ entry.entityType }}</span>
              </td>
              <td>{{ entry.user ? entry.user.name?.trim() || entry.user.email : 'System' }}</td>
              <td class="time-cell">{{ formatTime(entry.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="historyHasMore" class="load-more">
        <NbButton outlined :disabled="historyLoading" @click="loadMore">
          {{ historyLoading ? 'Loading…' : `Load more (${historyTotal - historyEntries.length} remaining)` }}
        </NbButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { apiFetch } from '../api'

interface HistoryEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  user: { id: string; email: string; name?: string | null } | null
}

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

function formatTime(ts: string) {
  return new Date(ts).toLocaleString()
}

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

.section {
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

.history-section {
  padding: 0;
  overflow: hidden;
}
.history-section > h3 {
  padding: 1.25rem 1.5rem 0;
  margin-bottom: 0.75rem;
}
.history-table-wrap {
  overflow-y: auto;
  max-height: 500px;
}
.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th,
  td {
    padding: 0.6rem 1.5rem;
    text-align: left;
  }
  th {
    background: #f7f7f9;
    font-size: 0.72rem;
    font-weight: 600;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e0e0e0;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  tr + tr td {
    border-top: 1px solid #f5f5f5;
  }
  tr:hover td {
    background: #fafafa;
  }
}
.action-code {
  font-size: 0.8rem;
  color: #5b21b6;
  background: #ede9fe;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}
.entity-type {
  font-size: 0.78rem;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-weight: 600;
}
.time-cell {
  color: #888;
  font-size: 0.8rem;
  white-space: nowrap;
}
.load-more {
  padding: 1rem 1.5rem;
}
.btn-outline {
  padding: 0.45rem 1rem;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  font-size: 0.875rem;
  cursor: pointer;
  color: #555;
  &:hover:not(:disabled) {
    background: #f0f0f0;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.empty-note {
  color: #888;
  font-size: 0.9rem;
}
</style>
