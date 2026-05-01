<template>
  <div>
    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-else-if="run">
      <div class="section">
        <div class="run-meta">
          <div class="meta-row">
            <span class="meta-label">Status</span>
            <span :class="['status-badge', statusClass(run.status)]">{{ run.status }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Run ID</span>
            <code class="meta-value">{{ run.id }}</code>
          </div>
          <div class="meta-row">
            <span class="meta-label">Started</span>
            <span class="meta-value">{{ formatDate(run.createdAt) }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Updated</span>
            <span class="meta-value">{{ formatDate(run.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Stats</h3>
        <div class="stats-grid">
          <div class="stat-card created">
            <div class="stat-value">{{ stats.created ?? 0 }}</div>
            <div class="stat-label">Created</div>
          </div>
          <div class="stat-card updated">
            <div class="stat-value">{{ stats.updated ?? 0 }}</div>
            <div class="stat-label">Updated</div>
          </div>
          <div class="stat-card skipped">
            <div class="stat-value">{{ stats.skipped ?? 0 }}</div>
            <div class="stat-label">Skipped</div>
          </div>
          <div class="stat-card errors">
            <div class="stat-value">{{ stats.errors ?? 0 }}</div>
            <div class="stat-label">Errors</div>
          </div>
        </div>
      </div>

      <div v-if="errorsList.length > 0" class="section">
        <h3>Errors</h3>
        <ul class="errors-list">
          <li v-for="(e, i) in errorsList" :key="i" class="error-item">
            {{ e }}
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { apiFetch } from '../api'

const route = useRoute()
const projectId = route.params.id as string
const runId = route.params.runId as string

interface ImportRun {
  id: string
  projectId: string
  status: string
  stats: string
  errors: string
  createdAt: string
  updatedAt: string
}

interface Stats {
  created?: number
  updated?: number
  skipped?: number
  errors?: number
}

const run = ref<ImportRun | null>(null)
const loading = ref(true)
const error = ref('')

const stats = ref<Stats>({})
const errorsList = ref<string[]>([])

onMounted(async () => {
  try {
    const data = await apiFetch<ImportRun>(`/projects/${projectId}/import-runs/${runId}`)
    run.value = data
    try {
      stats.value = JSON.parse(data.stats)
    } catch {
      stats.value = {}
    }
    try {
      errorsList.value = JSON.parse(data.errors)
    } catch {
      errorsList.value = []
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load import run'
  } finally {
    loading.value = false
  }
})

function statusClass(status: string) {
  if (status === 'DONE' || status === 'COMPLETED') return 'status-done'
  if (status === 'FAILED') return 'status-failed'
  return 'status-pending'
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString()
}
</script>

<style lang="scss" scoped>
.page-header {
  margin-bottom: 1.5rem;
  h2 {
    margin: 0.25rem 0 0.2rem;
    font-size: 1.4rem;
  }
}

.breadcrumb {
  font-size: 0.85rem;
  color: #1a1a2e;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
}

.loading {
  color: #888;
  padding: 2rem 0;
}
.error-msg {
  color: #e74c3c;
  padding: 1rem 0;
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

.run-meta {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.meta-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 70px;
}

.meta-value {
  font-size: 0.88rem;
  color: #333;
}

.status-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  &.status-done {
    background: #d5f5e3;
    color: #1e8449;
  }
  &.status-failed {
    background: #fde8e8;
    color: #c0392b;
  }
  &.status-pending {
    background: #fef9e7;
    color: #b7950b;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.stat-card {
  padding: 1rem;
  border-radius: 8px;
  text-align: center;

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 0.3rem;
  }

  .stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &.created {
    background: #d5f5e3;
    .stat-value {
      color: #1e8449;
    }
    .stat-label {
      color: #27ae60;
    }
  }
  &.updated {
    background: #fef9e7;
    .stat-value {
      color: #b7950b;
    }
    .stat-label {
      color: #d4ac0d;
    }
  }
  &.skipped {
    background: #f0f0f0;
    .stat-value {
      color: #555;
    }
    .stat-label {
      color: #888;
    }
  }
  &.errors {
    background: #fde8e8;
    .stat-value {
      color: #c0392b;
    }
    .stat-label {
      color: #e74c3c;
    }
  }
}

.errors-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.error-item {
  padding: 0.4rem 0.75rem;
  background: #fde8e8;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #c0392b;
  font-family: 'Courier New', monospace;
}
</style>
