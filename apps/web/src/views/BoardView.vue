<template>
  <Teleport defer to="#verba-topbar">
    <NbGrid align="center" gap="md">
      <NbGrid gap="sm" align="center">
        <button
          class="avatar-filter-chip"
          :class="{ active: filterUserIds.size === 0 }"
          @click="filterUserIds = new Set()"
        >
          {{ t('common.all') }}
        </button>
        <button
          v-for="m in members"
          :key="m.userId"
          class="avatar-filter-chip"
          :class="{ active: filterUserIds.has(m.userId) }"
          :title="m.user.name?.trim() || m.user.email"
          @click="toggleUserFilter(m.userId)"
        >
          {{ (m.user.name?.trim() || m.user.email).slice(0, 2).toUpperCase() }}
        </button>
        <NbSelect v-model="filterNamespaceId" :options="nsSelectOptions" />
        <NbButton v-if="hasActiveFilters" variant="secondary" outlined size="sm" @click="clearFilters">
          {{ t('common.clearFilters') }}
        </NbButton>
      </NbGrid>
      <span v-if="connected" class="live-badge">● {{ t('board.liveIndicator') }}</span>
      <span v-else class="offline-badge">● {{ t('board.offlineIndicator') }}</span>
    </NbGrid>
  </Teleport>

  <div class="board-view">
    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>

    <div v-else class="board-and-inspector">
      <div class="board-container">
        <!-- Column headers row -->
        <div class="board-grid">
          <!-- Status column headers (sticky, span full grid width) -->
          <div
            v-for="status in STATUSES"
            :key="status"
            class="col-header"
            :style="{ borderTopColor: STATUS_COLORS[status] }"
          >
            <span class="col-title">{{ t('common.status.' + status) }}</span>
            <span class="col-count">
              {{ allTranslations.filter((tr) => tr.status === status).length }}
            </span>
          </div>

          <!-- Swim lanes -->
          <template v-for="lane in swimLanes" :key="lane.id ?? '__backlog__'">
            <!-- Full-width lane header row -->
            <div class="lane-header-row" @click="toggleLane(lane.id)">
              <button
                class="collapse-toggle"
                :aria-label="isCollapsed(lane.id) ? t('board.expand') : t('board.collapse')"
              >
                {{ isCollapsed(lane.id) ? '▶' : '▼' }}
              </button>
              <span v-if="lane.id !== null" class="avatar">
                {{
                  avatarInitials({
                    email: lane.email,
                    name: lane.label !== lane.email ? lane.label : undefined,
                  })
                }}
              </span>
              <span v-else class="backlog-icon">📥</span>
              <span class="lane-name">{{ lane.id === null ? t('nav.backlog', 'Backlog') : lane.label }}</span>
              <span class="lane-count">{{ laneCount(lane.id) }}</span>
            </div>

            <!-- Cells per status column: visible when expanded -->
            <template v-if="!isCollapsed(lane.id)">
              <div
                v-for="status in STATUSES"
                :key="status"
                class="cell"
                :class="{ 'drag-over': isCellDragOver(lane.id, status) }"
                @dragover="onDragOver($event, lane.id, status)"
                @dragleave="onDragLeave"
                @drop="onDrop($event, lane.id, status)"
              >
                <div
                  v-for="card in getCell(lane.id, status)"
                  :key="card.id"
                  class="card"
                  :class="{
                    'card--selected': card.key.id === inspectorKeyId || card.key.id === modalKeyId,
                  }"
                  draggable="true"
                  @click="onCardClick(card)"
                  @dblclick.stop="onCardDblClick(card)"
                  @dragstart="onDragStart(card, lane.id, status)"
                >
                  <code class="key-name">{{
                    card.key.name.length > 28 ? card.key.name.slice(0, 28) + '…' : card.key.name
                  }}</code>
                  <div class="card-meta">
                    <LocaleBadge :code="card.locale.code" />
                    <span class="status-badge" :style="{ background: STATUS_COLORS[status] }">
                      {{ t('common.status.' + status) }}
                    </span>
                    <span v-if="card.assignedTo" class="avatar-sm" :title="userDisplayLabel(card.assignedTo)">
                      {{ avatarInitials(card.assignedTo) }}
                    </span>
                    <button
                      v-if="card.assignedTo && isMaintainerPlus"
                      class="unassign-btn"
                      :title="t('board.unassign')"
                      @click.stop="unassignCard(card)"
                      @mousedown.stop
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div v-if="getCell(lane.id, status).length === 0" class="empty-cell"></div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <!-- Inspector panel (single click): keyId lives in the URL path -->
      <transition name="slide">
        <div v-if="inspectorKeyId" class="inspector-panel">
          <KeyDetailPanel
            :key="inspectorKeyId"
            :project-id="projectId"
            :key-id="inspectorKeyId"
            :compact="true"
            :initial-drafts="getInspectorDrafts()"
            @text-draft="(localeId, text) => onDraft(inspectorKeyId!, localeId, text)"
            @close="closeInspector"
            @deleted="closeInspector"
          />
        </div>
      </transition>
    </div>

    <!-- Modal (double click) -->
    <Teleport to="body">
      <div v-if="modalKeyId" class="modal-backdrop" @click.self="modalKeyId = null">
        <div class="modal-box">
          <KeyDetailPanel
            :key="modalKeyId"
            :project-id="projectId"
            :key-id="modalKeyId"
            :compact="true"
            @close="modalKeyId = null"
            @deleted="modalKeyId = null"
          />
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKeyNameStore } from '../stores/keyName'
import { apiFetch } from '../api'
import { useAuthStore } from '../stores/auth'
import { useProjectWs } from '../composables/useProjectWs'
import KeyDetailPanel from '../components/KeyDetailPanel.vue'
import { useI18n } from 'vue-i18n'
import { type NbSelectOption } from '@nubisco/ui'
import LocaleBadge from '../components/LocaleBadge.vue'

const route = useRoute()
const router = useRouter()
const keyNameStore = useKeyNameStore()
const projectId = computed(() => route.params.id as string)
// Inspector key comes from the URL path; derived, never set directly
const inspectorKeyId = computed(() => (route.params.keyId as string | undefined) ?? null)
const auth = useAuthStore()
const { t } = useI18n()

interface Translation {
  id: string
  status: string
  assignedToId: string | null
  assignedTo: { id: string; email: string; name?: string | null } | null
  key: { id: string; name: string; namespaceId: string | null }
  locale: { code: string }
}

interface Member {
  userId: string
  role: string
  user: { id: string; email: string; name?: string | null }
}

type KanbanData = Record<string, Translation[]>

const STATUSES = ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED'] as const
const STATUS_COLORS: Record<string, string> = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  SUBMITTED: '#f59e0b',
  APPROVED: '#22c55e',
}

const allTranslations = ref<Translation[]>([])
const members = ref<Member[]>([])
const namespaces = ref<{ id: string; slug: string }[]>([])
const loading = ref(true)

const filterUserIds = ref<Set<string>>(new Set())
const filterNamespaceId = ref<string>('')
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const nsSelectOptions = computed<NbSelectOption[]>(() => [
  { label: t('board.allNamespaces'), value: '' },
  ...namespaces.value.map((ns) => ({ label: ns.slug, value: ns.id })),
])

const modalKeyId = ref<string | null>(null)
// Staged drafts: keyId → localeId → text (preserved when switching cards)
const stagedDrafts = ref(new Map<string, Record<string, string>>())

function onDraft(keyId: string, localeId: string, text: string) {
  const cur = stagedDrafts.value.get(keyId) ?? {}
  stagedDrafts.value.set(keyId, { ...cur, [localeId]: text })
}
function getInspectorDrafts() {
  return inspectorKeyId.value ? stagedDrafts.value.get(inspectorKeyId.value) : undefined
}

function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 3500)
}

const userRole = computed(() => {
  const me = auth.user
  if (!me) return 'READER'
  return members.value.find((m) => m.userId === me.id)?.role ?? 'READER'
})

const isMaintainerPlus = computed(() => ['MAINTAINER', 'ADMIN'].includes(userRole.value))

onMounted(async () => {
  try {
    const [kanban, mems, ns] = await Promise.all([
      apiFetch<KanbanData>(`/projects/${projectId.value}/kanban`),
      apiFetch<Member[]>(`/projects/${projectId.value}/members`),
      apiFetch<{ id: string; slug: string }[]>(`/projects/${projectId.value}/namespaces`),
    ])
    allTranslations.value = Object.values(kanban).flat()
    members.value = mems
    namespaces.value = ns
  } finally {
    loading.value = false
  }
})

// Seed key name cache from already-loaded kanban data so breadcrumb shows immediately
watch(
  allTranslations,
  (translations) => {
    for (const tr of translations) {
      keyNameStore.seed(tr.key.id, tr.key.name)
    }
  },
  { immediate: true },
)

function handleWsMessage(msg: Record<string, unknown>) {
  if (msg.type === 'translation.moved') {
    const idx = allTranslations.value.findIndex((t) => t.id === msg.translationId)
    if (idx !== -1) {
      allTranslations.value[idx] = {
        ...allTranslations.value[idx],
        status: msg.status as string,
        assignedToId: (msg.assignedToId as string | null) ?? null,
      }
      allTranslations.value = [...allTranslations.value]
    }
  }
  if (msg.type === 'translation.assigned') {
    const idx = allTranslations.value.findIndex((t) => t.id === msg.translationId)
    if (idx !== -1) {
      allTranslations.value[idx] = {
        ...allTranslations.value[idx],
        assignedToId: (msg.assignedToId as string | null) ?? null,
      }
      allTranslations.value = [...allTranslations.value]
    }
  }
}

const { connected } = useProjectWs(projectId.value, handleWsMessage)

// Swim lanes: one per assignee/member, Backlog (unassigned) LAST
const swimLanes = computed(() => {
  const assigneeIds = new Set(
    allTranslations.value.filter((t) => t.assignedToId !== null).map((t) => t.assignedToId as string),
  )
  const memberMap = new Map(members.value.map((m) => [m.userId, m.user]))

  const userLanes: { id: string | null; label: string; email: string }[] = []
  const seen = new Set<string>()

  for (const id of assigneeIds) {
    if (!seen.has(id)) {
      seen.add(id)
      const user = memberMap.get(id)
      userLanes.push({
        id,
        label: user ? user.name?.trim() || user.email : id,
        email: user?.email ?? id,
      })
    }
  }
  for (const m of members.value) {
    if (!seen.has(m.userId)) {
      seen.add(m.userId)
      userLanes.push({
        id: m.userId,
        label: m.user.name?.trim() || m.user.email,
        email: m.user.email,
      })
    }
  }
  return [...userLanes, { id: null, label: 'Backlog', email: 'Backlog' }]
})

const collapsedLanes = ref(new Set<string>())
function laneKey(id: string | null) {
  return id ?? '__backlog__'
}
function toggleLane(id: string | null) {
  const k = laneKey(id)
  if (collapsedLanes.value.has(k)) collapsedLanes.value.delete(k)
  else collapsedLanes.value.add(k)
  collapsedLanes.value = new Set(collapsedLanes.value)
}
function isCollapsed(id: string | null) {
  // Auto-collapse user lanes not in the active filter
  if (id !== null && filterUserIds.value.size > 0 && !filterUserIds.value.has(id)) return true
  return collapsedLanes.value.has(laneKey(id))
}

function getCell(laneId: string | null, status: string): Translation[] {
  return visibleTranslations.value.filter((t) => t.assignedToId === laneId && t.status === status)
}

const visibleTranslations = computed(() => {
  return allTranslations.value.filter((t) => {
    const userOk = filterUserIds.value.size === 0 || t.assignedToId === null || filterUserIds.value.has(t.assignedToId)
    const nsOk = !filterNamespaceId.value || t.key.namespaceId === filterNamespaceId.value
    return userOk && nsOk
  })
})

function toggleUserFilter(userId: string) {
  const next = new Set(filterUserIds.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  filterUserIds.value = next
}

function clearFilters() {
  filterUserIds.value = new Set()
  filterNamespaceId.value = ''
}

const hasActiveFilters = computed(() => filterUserIds.value.size > 0 || !!filterNamespaceId.value)

function laneCount(laneId: string | null): number {
  return allTranslations.value.filter((t) => t.assignedToId === laneId).length
}

const dragging = ref<{
  t: Translation
  fromLaneId: string | null
  fromStatus: string
} | null>(null)
const dragOverCell = ref<{ laneId: string | null; status: string } | null>(null)

function onDragStart(t: Translation, fromLaneId: string | null, fromStatus: string) {
  dragging.value = { t, fromLaneId, fromStatus }
}

function onDragOver(e: DragEvent, laneId: string | null, status: string) {
  e.preventDefault()
  dragOverCell.value = { laneId, status }
}

function onDragLeave() {
  dragOverCell.value = null
}

function isCellDragOver(laneId: string | null, status: string): boolean {
  const c = dragOverCell.value
  return c !== null && c.laneId === laneId && c.status === status
}

function avatarInitials(user: { email: string; name?: string | null }): string {
  const label = user.name?.trim() || user.email
  return label.slice(0, 2).toUpperCase()
}
function userDisplayLabel(user: { email: string; name?: string | null }): string {
  return user.name?.trim() || user.email
}

function moveCardLocal(translationId: string, newLaneId: string | null, newStatus: string) {
  const idx = allTranslations.value.findIndex((t) => t.id === translationId)
  if (idx === -1) return
  const t = {
    ...allTranslations.value[idx],
    assignedToId: newLaneId,
    status: newStatus,
  }
  if (newLaneId === null) {
    t.assignedTo = null
  } else {
    const user = members.value.find((m) => m.userId === newLaneId)?.user
    t.assignedTo = user ? { id: user.id, email: user.email } : t.assignedTo
  }
  allTranslations.value = [...allTranslations.value.slice(0, idx), t, ...allTranslations.value.slice(idx + 1)]
}

async function unassignCard(card: Translation) {
  const prev = card.assignedToId
  moveCardLocal(card.id, null, card.status)
  try {
    await apiFetch(`/projects/${projectId.value}/translations/${card.id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigneeId: null }),
    })
  } catch (err: unknown) {
    moveCardLocal(card.id, prev, card.status)
    showToast(err instanceof Error ? err.message : 'Failed to unassign')
  }
}

async function onDrop(e: DragEvent, toLaneId: string | null, toStatus: string) {
  e.preventDefault()
  dragOverCell.value = null
  const drag = dragging.value
  dragging.value = null
  if (!drag) return

  const { t, fromLaneId, fromStatus } = drag
  const laneChanged = fromLaneId !== toLaneId
  const statusChanged = fromStatus !== toStatus
  if (!laneChanged && !statusChanged) return

  moveCardLocal(t.id, toLaneId, toStatus)

  try {
    if (laneChanged) {
      await apiFetch(`/projects/${projectId.value}/translations/${t.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: toLaneId }),
      })
    }
    if (statusChanged) {
      await apiFetch(`/projects/${projectId.value}/translations/${t.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: toStatus }),
      })
    }
  } catch (err: unknown) {
    moveCardLocal(t.id, fromLaneId, fromStatus)
    showToast(err instanceof Error ? err.message : 'Failed to update')
  }
}

function onCardClick(card: Translation) {
  modalKeyId.value = null
  router.push({ name: 'board-key', params: { id: projectId.value, keyId: card.key.id } })
}

function closeInspector() {
  router.push({ name: 'board', params: { id: projectId.value } })
}

function onCardDblClick(card: Translation) {
  modalKeyId.value = card.key.id
  // Navigate back to board route so URL doesn't show a keyId for the modal
  if (route.name === 'board-key') {
    router.push({ name: 'board', params: { id: projectId.value } })
  }
}
</script>

<style lang="scss" scoped>
.board-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  margin-bottom: 1rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  h2 {
    margin: 0;
    font-size: 1.4rem;
  }
}

.live-badge {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--nb-c-success);
  letter-spacing: 0.04em;
}

.offline-badge {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--nb-c-warning);
  letter-spacing: 0.04em;
}

.loading {
  color: #888;
  padding: 2rem;
}

.board-and-inspector {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
}

.board-container {
  flex: 1;
  overflow: auto;
  min-width: 0;
}

.inspector-panel {
  width: 420px;
  border-left: 1px solid #e0e0e0;
  overflow-y: auto;
  flex-shrink: 0;
  background: #fff;
}

.slide-enter-active,
.slide-leave-active {
  transition: width 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  width: 0;
  overflow: hidden;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 0;
  min-width: max-content;
}

.col-header {
  background: #fff;
  border-top: 3px solid #ccc;
  border-bottom: 2px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  padding: 0.65rem 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;

  .col-title {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #444;
  }

  .col-count {
    font-size: 0.72rem;
    background: #f0f0f5;
    color: #666;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-weight: 600;
  }
}

// Full-width lane header spanning all 4 columns
.lane-header-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1rem;
  background: #f4f4f8;
  border-top: 2px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: #ededf5;
  }
}

.collapse-toggle {
  background: none;
  border: none;
  font-size: 0.65rem;
  color: #999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.lane-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #1a1a2e;
  flex: 1;
}

.backlog-icon {
  font-size: 1rem;
  line-height: 1;
}

.lane-count {
  font-size: 0.7rem;
  background: #e0e0ea;
  color: #555;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  font-weight: 600;
  flex-shrink: 0;
}

.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #6d28d9;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cell {
  background: #fafafa;
  border-bottom: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  padding: 0.4rem;
  min-height: 60px;
  transition: background 0.1s;

  &.drag-over {
    background: #ede9fe;
    outline: 2px dashed #6d28d9;
    outline-offset: -2px;
  }
}

.card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
  margin-bottom: 0.35rem;
  user-select: none;
  transition: box-shadow 0.12s;

  &:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }
  &:active {
    cursor: grabbing;
  }
  &:last-child {
    margin-bottom: 0;
  }

  &.card--selected {
    border-color: #4f46e5;
    border-width: 2px;
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
  }
}

.key-name {
  display: block;
  font-size: 0.75rem;
  color: #1a1a2e;
  margin-bottom: 0.35rem;
}

.card-meta {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  flex-wrap: wrap;
}

.status-badge {
  font-size: 0.64rem;
  color: #fff;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-weight: 600;
}

.avatar-sm {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #6d28d9;
  color: #fff;
  font-size: 0.58rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.unassign-btn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0 0.15rem;
  line-height: 1;
  margin-left: auto;

  &:hover {
    color: #e74c3c;
  }
}

.empty-cell {
  min-height: 40px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: #fff;
  border-radius: 8px;
  width: 700px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.filter-avatars {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.avatar-filter-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #e0e0e0;
  background: #f5f5f5;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.15s,
    background 0.15s;
  color: #444;

  &.active {
    border-color: #4f46e5;
    background: #ede9fe;
    color: #4f46e5;
  }
  &:hover:not(.active) {
    border-color: #aaa;
    background: #ececec;
  }
}
</style>

<style>
.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a2e;
  color: #fff;
  padding: 0.65rem 1.25rem;
  border-radius: 6px;
  font-size: 0.88rem;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
