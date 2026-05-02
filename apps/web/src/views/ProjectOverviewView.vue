<template>
  <div class="tab-content">
    <div class="stats-row">
      <RouterLink :to="`/keys/${projectId}`" class="stat-card clickable">
        <div class="stat-value">{{ store.totalKeys }}</div>
        <div class="stat-label">{{ t('projects.header.totalKeys') }}</div>
      </RouterLink>
      <RouterLink :to="`/review/${projectId}`" class="stat-card warning clickable">
        <div class="stat-value">{{ store.needsReview }}</div>
        <div class="stat-label">{{ t('projects.header.needsReview') }}</div>
      </RouterLink>
    </div>

    <div class="section">
      <h3>{{ t('projects.namespaces.title') }}</h3>
      <div v-if="store.namespaces.length === 0" class="empty-note">
        {{ t('projects.namespaces.empty') }}
      </div>
      <div v-else class="ns-count-list">
        <div v-for="ns in store.namespaces" :key="ns.id" class="ns-count-row">
          <span class="ns-tag">{{ ns.slug }}</span>
          <span class="ns-name">{{ ns.name }}</span>
          <span class="ns-count-badge">{{ (ns as any)._count?.keys ?? 0 }} keys</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h3>My Tasks</h3>
      <div v-if="store.tasks.length === 0" class="empty-note">No active tasks</div>
      <div v-else class="task-list">
        <RouterLink
          v-for="task in store.tasks"
          :key="task.id"
          :to="`/keys/${projectId}/${task.key.id}`"
          class="task-card"
        >
          <code class="task-key">{{ task.key.name }}</code>
          <div class="task-meta">
            <LocaleBadge :code="task.locale.code" />
            <span class="status-dot" :style="{ background: STATUS_COLORS[task.status] || '#888' }" />
          </div>
        </RouterLink>
      </div>
    </div>

    <div class="section">
      <h3>{{ t('projects.locales.title') }}</h3>
      <div v-if="store.localeProgress.length > 0" class="locale-list">
        <div v-for="lp in store.localeProgress" :key="lp.code" class="locale-row">
          <LocaleBadge :code="lp.code" />
          <span class="locale-name">{{ lp.name }}</span>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" :style="{ width: lp.total ? `${(lp.approved / lp.total) * 100}%` : '0%' }" />
          </div>
          <span class="progress-label">{{ lp.approved }} / {{ lp.total }}</span>
          <NbButton class="icon-btn" title="Export JSON" @click="exportLocale(lp.code)">⬇</NbButton>
        </div>
      </div>
      <div v-else class="empty-note">No locales yet</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { useI18n } from 'vue-i18n'
import LocaleBadge from '../components/LocaleBadge.vue'

const route = useRoute()
const projectId = route.params.id as string
const store = useProjectStore()
const { t } = useI18n()
const apiBase = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000')

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#3b82f6',
  SUBMITTED: '#f59e0b',
}

function exportLocale(localeCode: string) {
  const url = `${apiBase}/projects/${projectId}/export/${localeCode}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = `${localeCode}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
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

.stats-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.75rem;
  min-width: 140px;
  text-decoration: none;
  display: block;
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 0.25rem;
    color: #1a1a2e;
  }
  .stat-label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  &.warning .stat-value {
    color: #e67e22;
  }
  &.clickable:hover {
    border-color: #5b21b6;
    box-shadow: 0 2px 8px rgba(91, 33, 182, 0.12);
    cursor: pointer;
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

.ns-count-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ns-count-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid #f0f0f0;
  &:last-child {
    border-bottom: none;
  }
}
.ns-count-badge {
  margin-left: auto;
  font-size: 0.75rem;
  background: #f0f0f0;
  color: #555;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
}
.ns-name {
  font-size: 0.85rem;
  color: #666;
}
.ns-tag {
  font-size: 0.78rem;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.75rem;
  background: #f7f7f9;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  }
}
.task-key {
  font-size: 0.82rem;
  color: #1a1a2e;
}
.task-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #888;
}

.locale-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.locale-row {
  display: grid;
  grid-template-columns: 70px 1fr 120px 70px 28px;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid #f0f0f0;
  &:last-child {
    border-bottom: none;
  }
}
.locale-name {
  font-size: 0.85rem;
  color: #666;
}
.progress-bar-wrap {
  height: 8px;
  background: #eee;
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: #27ae60;
  border-radius: 4px;
  transition: width 0.4s;
}
.progress-label {
  font-size: 0.8rem;
  color: #666;
  text-align: right;
}
.icon-btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
  line-height: 1;
  &:hover {
    background: #f0f0f0;
  }
}
.empty-note {
  color: #888;
  font-size: 0.9rem;
}
</style>
