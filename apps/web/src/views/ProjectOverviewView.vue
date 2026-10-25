<template>
  <div class="tab-content">
    <NbCardGrid min="160px" class="stats-row">
      <NbStat :label="t('projects.header.totalKeys')" :value="store.totalKeys" :to="`/keys/${projectId}`" />
      <NbStat
        :label="t('projects.header.needsReview')"
        :value="store.needsReview"
        :status="store.needsReview ? 'warning' : 'neutral'"
        :to="`/review/${projectId}`"
      />
    </NbCardGrid>

    <NbPanel class="section">
      <h3>{{ t('projects.namespaces.title') }}</h3>
      <div v-if="store.namespaces.length === 0" class="empty-note">
        {{ t('projects.namespaces.empty') }}
      </div>
      <div v-else class="ns-count-list">
        <div v-for="ns in store.namespaces" :key="ns.id" class="ns-count-row">
          <NbBadge variant="primary">{{ ns.slug }}</NbBadge>
          <span class="ns-name">{{ ns.name }}</span>
          <NbBadge class="ns-count">{{ (ns as any)._count?.keys ?? 0 }} keys</NbBadge>
        </div>
      </div>
    </NbPanel>

    <NbPanel class="section">
      <h3>My Tasks</h3>
      <div v-if="store.tasks.length === 0" class="empty-note">No active tasks</div>
      <NbCardGrid v-else min="220px" gap="sm">
        <NbCard v-for="task in store.tasks" :key="task.id" :to="`/keys/${projectId}/${task.key.id}`">
          <template #title>
            <code class="task-key">{{ task.key.name }}</code>
          </template>
          <template #footer>
            <LocaleBadge :code="task.locale.code" />
            <span class="status-dot" :style="{ background: STATUS_COLORS[task.status] || 'var(--nb-c-text-subtle)' }" />
          </template>
        </NbCard>
      </NbCardGrid>
    </NbPanel>

    <NbPanel class="section">
      <h3>{{ t('projects.locales.title') }}</h3>
      <div v-if="store.localeProgress.length > 0" class="locale-list">
        <div v-for="lp in store.localeProgress" :key="lp.code" class="locale-row">
          <LocaleBadge :code="lp.code" />
          <span class="locale-name">{{ lp.name }}</span>
          <NbProgressBar
            :label="lp.name"
            hide-label
            :value="lp.approved"
            :max="lp.total || 1"
            size="sm"
            :status="localeProgressStatus(lp)"
          />
          <span class="progress-label">{{ lp.approved }} / {{ lp.total }}</span>
          <NbButton
            variant="ghost"
            size="sm"
            icon="download-simple"
            title="Export JSON"
            aria-label="Export JSON"
            @click="exportLocale(lp.code)"
          />
        </div>
      </div>
      <div v-else class="empty-note">No locales yet</div>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { useI18n } from 'vue-i18n'
import LocaleBadge from '../components/LocaleBadge.vue'
import { localeProgressStatus } from '../utils/localeProgress'

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
  margin-bottom: 1.5rem;
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
.ns-count {
  margin-left: auto;
}
.ns-name {
  font-size: 0.85rem;
  color: var(--nb-c-text-subtle);
}

.task-key {
  font-size: 0.82rem;
  color: var(--nb-c-text);
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
  grid-template-columns: 70px 1fr 120px 70px auto;
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
    grid-template-columns: auto minmax(0, 1fr) auto auto;
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
.progress-label {
  font-size: 0.8rem;
  color: var(--nb-c-text-subtle);
  text-align: right;
}
.empty-note {
  color: var(--nb-c-text-subtle);
  font-size: 0.9rem;
}
</style>
