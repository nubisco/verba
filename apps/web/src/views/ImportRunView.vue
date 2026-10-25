<template>
  <div>
    <NbSkeleton v-if="loading" variant="block" :height="200" radius="md" label="Loading import run" />
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-else-if="run">
      <NbPanel class="section">
        <div class="run-meta">
          <div class="meta-row">
            <span class="meta-label">Status</span>
            <NbBadge :variant="statusVariant(run.status)">{{ run.status }}</NbBadge>
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
      </NbPanel>

      <NbPanel class="section">
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
      </NbPanel>

      <NbPanel v-if="errorsList.length > 0" class="section">
        <h3>Errors</h3>
        <ul class="errors-list">
          <li v-for="(e, i) in errorsList" :key="i" class="error-item">
            {{ e }}
          </li>
        </ul>
      </NbPanel>
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

function statusVariant(status: string): 'green' | 'red' | 'orange' {
  if (status === 'DONE' || status === 'COMPLETED') return 'green'
  if (status === 'FAILED') return 'red'
  return 'orange'
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
  color: var(--nb-c-text);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
}

.error-msg {
  color: var(--nb-c-status-error);
  padding: 1rem 0;
}

.section {
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--nb-c-text-muted);
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
  color: var(--nb-c-text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 70px;
}

.meta-value {
  font-size: 0.88rem;
  color: var(--nb-c-text);
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
    background: var(--nb-c-success-surface);
    .stat-value {
      color: var(--nb-c-on-success-surface);
    }
    .stat-label {
      color: var(--nb-c-on-success-surface);
    }
  }
  &.updated {
    background: var(--nb-c-warning-surface);
    .stat-value {
      color: var(--nb-c-on-warning-surface);
    }
    .stat-label {
      color: var(--nb-c-on-warning-surface);
    }
  }
  &.skipped {
    background: var(--nb-c-neutral-surface);
    .stat-value {
      color: var(--nb-c-on-neutral-surface);
    }
    .stat-label {
      color: var(--nb-c-on-neutral-surface);
    }
  }
  &.errors {
    background: var(--nb-c-danger-surface);
    .stat-value {
      color: var(--nb-c-on-danger-surface);
    }
    .stat-label {
      color: var(--nb-c-on-danger-surface);
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
  background: var(--nb-c-danger-surface);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--nb-c-on-danger-surface);
  font-family: var(--nb-font-family-mono);
}
</style>
