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
            <span class="status-dot" :style="{ background: STATUS_COLORS[task.status] || 'var(--nb-c-text-subtle)' }" />
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
  IN_PROGRESS: 'var(--nb-c-info)',
  SUBMITTED: 'var(--nb-c-warning)',
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
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-border);
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
    color: var(--nb-c-text);
  }
  .stat-label {
    font-size: 0.8rem;
    color: var(--nb-c-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  &.warning .stat-value {
    color: var(--nb-c-status-warning);
  }
  &.clickable:hover {
    border-color: var(--nb-c-primary);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
    cursor: pointer;
  }
}

.section {
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-border);
  border-radius: 8px;
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
  border-bottom: 1px solid var(--nb-c-border);
  &:last-child {
    border-bottom: none;
  }
}
.ns-count-badge {
  margin-left: auto;
  font-size: 0.75rem;
  background: var(--nb-c-surface-hover);
  color: var(--nb-c-text-muted);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
}
.ns-name {
  font-size: 0.85rem;
  color: var(--nb-c-text-subtle);
}
.ns-tag {
  font-size: 0.78rem;
  background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
  color: var(--nb-c-primary);
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
  background: var(--nb-c-layer-2);
  border: 1px solid var(--nb-c-border);
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  &:hover {
    box-shadow: 0 2px 8px color-mix(in srgb, var(--nb-c-black) 7%, transparent);
  }
}
.task-key {
  font-size: 0.82rem;
  color: var(--nb-c-text);
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
  background: var(--nb-c-text-subtle);
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
  border-bottom: 1px solid var(--nb-c-border);
  &:last-child {
    border-bottom: none;
  }

  // Five fixed columns need about 330px, more than a phone's card has. On a
  // phone the bar takes a second line, so the export button stays on screen.
  @include variables.phone {
    grid-template-columns: auto minmax(0, 1fr) auto 28px;
    grid-template-areas:
      'badge name label export'
      'bar bar bar bar';
    row-gap: 0.4rem;

    > :nth-child(1) {
      grid-area: badge;
    }
    > :nth-child(2) {
      grid-area: name;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    > :nth-child(3) {
      grid-area: bar;
    }
    > :nth-child(4) {
      grid-area: label;
    }
    > :nth-child(5) {
      grid-area: export;
    }
  }
}
.locale-name {
  font-size: 0.85rem;
  color: var(--nb-c-text-subtle);
}
.progress-bar-wrap {
  height: 8px;
  background: var(--nb-c-surface-hover);
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--nb-c-success);
  border-radius: 4px;
  transition: width 0.4s;
}
.progress-label {
  font-size: 0.8rem;
  color: var(--nb-c-text-subtle);
  text-align: right;
}
.icon-btn {
  background: none;
  border: 1px solid var(--nb-c-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
  line-height: 1;
  &:hover {
    background: var(--nb-c-surface-hover);
  }
}
.empty-note {
  color: var(--nb-c-text-subtle);
  font-size: 0.9rem;
}
</style>
