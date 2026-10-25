<template>
  <div class="board-view">
    <!-- Filters: teleported into #verba-topbar. On a phone they stay here, above
         the board, where they can wrap instead of scrolling sideways. -->
    <Teleport defer to="#verba-topbar" :disabled="phone">
      <NbGrid align="center" gap="md" class="board-toolbar">
        <NbGrid gap="sm" align="center" class="board-toolbar__filters">
          <NbBadge
            interactive
            :variant="filterUserIds.size === 0 ? 'primary' : 'grey'"
            :aria-pressed="filterUserIds.size === 0"
            @click="filterUserIds = new Set()"
          >
            {{ t('common.all') }}
          </NbBadge>
          <NbBadge
            v-for="m in members"
            :key="m.userId"
            interactive
            :variant="filterUserIds.has(m.userId) ? 'primary' : 'grey'"
            :aria-pressed="filterUserIds.has(m.userId)"
            :title="userDisplayLabel(m.user)"
            :aria-label="userDisplayLabel(m.user)"
            @click="toggleUserFilter(m.userId)"
          >
            {{ avatarInitials(m.user) }}
          </NbBadge>
          <NbSelect v-model="filterNamespaceId" :options="nsSelectOptions" />
          <NbButton v-if="hasActiveFilters" variant="secondary" outlined size="sm" @click="clearFilters">
            {{ t('common.clearFilters') }}
          </NbButton>
        </NbGrid>
        <NbBadge v-if="connected" variant="green" dot>{{ t('board.liveIndicator') }}</NbBadge>
        <NbBadge v-else variant="orange" dot>{{ t('board.offlineIndicator') }}</NbBadge>
      </NbGrid>
    </Teleport>
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
            <NbBadge size="sm">{{ allTranslations.filter((tr) => tr.status === status).length }}</NbBadge>
          </div>

          <!-- Swim lanes -->
          <template v-for="lane in swimLanes" :key="lane.id ?? '__backlog__'">
            <!-- Full-width lane header row -->
            <div class="lane-header-row" @click="toggleLane(lane.id)">
              <NbButton
                variant="ghost"
                size="xs"
                :icon="isCollapsed(lane.id) ? 'caret-right' : 'caret-down'"
                :aria-label="isCollapsed(lane.id) ? t('board.expand') : t('board.collapse')"
                :aria-expanded="!isCollapsed(lane.id)"
              />
              <NbAvatar
                v-if="lane.id !== null"
                :email="lane.email"
                :name="lane.label !== lane.email ? lane.label : undefined"
                size="sm"
                decorative
              />
              <NbIcon v-else name="tray" :size="20" />
              <span class="lane-name">{{ lane.id === null ? t('nav.backlog', 'Backlog') : lane.label }}</span>
              <NbBadge size="sm">{{ laneCount(lane.id) }}</NbBadge>
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
                    <NbBadge size="sm" :variant="STATUS_BADGE[status]">{{ t('common.status.' + status) }}</NbBadge>
                    <NbAvatar
                      v-if="card.assignedTo"
                      :email="card.assignedTo.email"
                      :name="card.assignedTo.name"
                      size="xs"
                      :title="userDisplayLabel(card.assignedTo)"
                    />
                    <NbButton
                      v-if="card.assignedTo && isMaintainerPlus"
                      variant="ghost"
                      size="xs"
                      icon="x"
                      class="unassign-btn"
                      :title="t('board.unassign')"
                      :aria-label="t('board.unassign')"
                      @click.stop="unassignCard(card)"
                      @mousedown.stop
                    />
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
    <NbModal
      :open="!!modalKeyId"
      :title="modalKeyName"
      size="lg"
      close-on-overlay
      class="key-modal"
      @close="modalKeyId = null"
    >
      <KeyDetailPanel
        v-if="modalKeyId"
        :key="modalKeyId"
        :project-id="projectId"
        :key-id="modalKeyId"
        :compact="true"
        @deleted="modalKeyId = null"
      />
    </NbModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKeyNameStore } from '../stores/keyName'
import { apiFetch } from '../api'
import { useAuthStore } from '../stores/auth'
import { useProjectWs } from '../composables/useProjectWs'
import { useNotifications } from '../composables/useNotifications'
import KeyDetailPanel from '../components/KeyDetailPanel.vue'
import { trackEvent } from '../composables/useAnalytics'
import { useI18n } from 'vue-i18n'
import { usePhoneLayout, type ISelectOption } from '@nubisco/ui'
import LocaleBadge from '../components/LocaleBadge.vue'

const route = useRoute()
const router = useRouter()
const keyNameStore = useKeyNameStore()
const projectId = computed(() => route.params.id as string)
// Inspector key comes from the URL path; derived, never set directly
const inspectorKeyId = computed(() => (route.params.keyId as string | undefined) ?? null)
const auth = useAuthStore()
const { t } = useI18n()
const { phone } = usePhoneLayout()

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
// Workflow colours come from the @nubisco/ui status tokens so they follow the
// theme. STATUS_COLORS paints the column rule, and the card pill is an NbBadge
// with the same variant mapping KeyDetailPanel uses.
const STATUS_COLORS: Record<string, string> = {
  TODO: 'var(--nb-c-component-plain)',
  IN_PROGRESS: 'var(--nb-c-info)',
  SUBMITTED: 'var(--nb-c-warning)',
  APPROVED: 'var(--nb-c-success)',
}
const STATUS_BADGE: Record<string, 'grey' | 'blue' | 'orange' | 'green'> = {
  TODO: 'grey',
  IN_PROGRESS: 'blue',
  SUBMITTED: 'orange',
  APPROVED: 'green',
}

const allTranslations = ref<Translation[]>([])
const members = ref<Member[]>([])
const namespaces = ref<{ id: string; slug: string }[]>([])
const loading = ref(true)

const filterUserIds = ref<Set<string>>(new Set())
const filterNamespaceId = ref<string>('')
const notifications = useNotifications()

const nsSelectOptions = computed<ISelectOption[]>(() => [
  { label: t('board.allNamespaces'), value: '' },
  ...namespaces.value.map((ns) => ({ label: ns.slug, value: ns.id })),
])

const modalKeyId = ref<string | null>(null)
const modalKeyName = computed(() => allTranslations.value.find((tr) => tr.key.id === modalKeyId.value)?.key.name ?? '')
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
  notifications.error(msg)
}

const userRole = computed(() => {
  const me = auth.user
  if (!me) return 'READER'
  return members.value.find((m) => m.userId === me.id)?.role ?? 'READER'
})

const isMaintainerPlus = computed(() => ['MAINTAINER', 'ADMIN'].includes(userRole.value))

onMounted(async () => {
  trackEvent('kanban_opened', { project_id: projectId.value })
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
    trackEvent('kanban_card_moved', {
      project_id: projectId.value,
      lane_changed: laneChanged,
      status_changed: statusChanged,
      from_status: fromStatus,
      to_status: toStatus,
    })
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
// On a phone the filters render in the page (see the Teleport), so they wrap.
@include variables.phone {
  .board-toolbar,
  .board-toolbar__filters {
    flex-wrap: wrap;
  }

  .board-toolbar {
    flex-shrink: 0;
    margin-bottom: 0.75rem;
  }
}

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

.loading {
  color: var(--nb-c-text-subtle);
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
  border-left: 1px solid var(--nb-c-border);
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--nb-c-layer-1);
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
  background: var(--nb-c-layer-1);
  border-top: 3px solid var(--nb-c-border);
  border-bottom: 2px solid var(--nb-c-border);
  border-right: 1px solid var(--nb-c-border);
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
    color: var(--nb-c-text-muted);
  }
}

// Full-width lane header spanning all 4 columns
.lane-header-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1rem;
  background: var(--nb-c-layer-2);
  border-top: 2px solid var(--nb-c-border);
  border-bottom: 1px solid var(--nb-c-border);
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--nb-c-surface-hover);
  }
}

.lane-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--nb-c-text);
  flex: 1;
}

.cell {
  background: var(--nb-c-bg);
  border-bottom: 1px solid var(--nb-c-border);
  border-right: 1px solid var(--nb-c-border);
  padding: 0.4rem;
  min-height: 60px;
  transition: background 0.1s;

  &.drag-over {
    background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
    outline: 2px dashed var(--nb-c-primary);
    outline-offset: -2px;
  }
}

.card {
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-border);
  border-radius: 5px;
  padding: 0.5rem 0.6rem;
  cursor: pointer;
  margin-bottom: 0.35rem;
  user-select: none;
  transition: box-shadow 0.12s;

  &:hover {
    box-shadow: 0 2px 6px color-mix(in srgb, var(--nb-c-black) 10%, transparent);
  }
  &:active {
    cursor: grabbing;
  }
  &:last-child {
    margin-bottom: 0;
  }

  &.card--selected {
    border-color: var(--nb-c-primary);
    border-width: 2px;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nb-c-primary) 15%, transparent);
  }
}

.key-name {
  display: block;
  font-size: 0.75rem;
  color: var(--nb-c-text);
  margin-bottom: 0.35rem;
}

.card-meta {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  flex-wrap: wrap;
}

.unassign-btn {
  margin-left: auto;
}

.empty-cell {
  min-height: 40px;
}
</style>
