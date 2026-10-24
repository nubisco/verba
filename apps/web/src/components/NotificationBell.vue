<template>
  <!-- The bell is @nubisco/ui's notification centre with the rail's own menu
       item as its trigger, as in Acta (web/src/components/NotificationBell.vue):
       a labelled row with the count when the rail is expanded, the icon with
       the count on its corner when it is collapsed. The panel, its rows, the
       empty, loading and error states and the phone sheet all belong to
       NbNotificationCenter and are not restyled here. -->
  <NbNotificationCenter
    v-model:open="open"
    label="Notifications"
    :unread-count="unreadCount"
    :item-count="notifications.length"
    :loading="loading"
    :error="failed"
    error-title="Could not load your notifications"
    error-description="The list below may be out of date."
    empty-title="No notifications yet"
    empty-description="You hear about comments that mention you, and comments on keys you are assigned to."
    :width="360"
    side="right"
    align="end"
    close-on-select
    close-on-navigate
    @mark-all-read="markAllRead"
    @retry="load"
  >
    <template #trigger="{ triggerProps, setTriggerRef, toggle }">
      <NbSidebarMenu density="compact">
        <NbSidebarMenuItem
          :ref="setTriggerRef"
          v-bind="triggerProps"
          label="Notifications"
          :icon="unreadCount > 0 ? 'bell-ringing' : 'bell'"
          :active="open"
          :badge="unreadCount > 0 ? unreadCount : undefined"
          badge-variant="danger"
          @click="toggle"
        />
      </NbSidebarMenu>
    </template>

    <NbNotificationCenterItem
      v-for="n in notifications"
      :key="n.id"
      :title="titleFor(n)"
      :body="commentExcerpt(n) || undefined"
      :time="n.createdAt"
      :read="n.isRead"
      :icon="n.type === 'MENTION' ? 'at' : 'chat-circle'"
      variant="info"
      @select="onClickNotification(n)"
    />
  </NbNotificationCenter>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useAuthStore } from '../stores/auth'

interface NotifActor {
  id: string
  name: string | null
  email: string
}

interface NotifKey {
  id: string
  name: string
  namespace: { slug: string } | null
}

interface Notification {
  id: string
  type: 'MENTION' | 'KEY_COMMENT'
  projectId: string
  keyId: string
  commentId: string | null
  isRead: boolean
  createdAt: string
  actor: NotifActor | null
  key: NotifKey | null
  comment: { id: string; text: string } | null
}

const router = useRouter()
const auth = useAuthStore()

const unreadCount = ref(0)
const notifications = ref<Notification[]>([])
const open = ref(false)
const loaded = ref(false)
const loading = ref(false)
const failed = ref(false)

async function fetchCount() {
  try {
    const data = await apiFetch<{ count: number }>('/notifications/count')
    unreadCount.value = data.count
  } catch {
    // non-critical: the count is refreshed when the panel opens
  }
}

/**
 * A failure is its own state and not a flavour of empty: a panel that says
 * "no notifications yet" because the request failed is the one wrong answer.
 */
async function load() {
  loading.value = notifications.value.length === 0
  failed.value = false
  try {
    notifications.value = await apiFetch<Notification[]>('/notifications')
    loaded.value = true
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

watch(open, (now) => {
  if (now && !loaded.value) void load()
})

async function markAllRead() {
  try {
    await apiFetch('/notifications/read-all', { method: 'PATCH' })
    notifications.value = notifications.value.map((n) => ({ ...n, isRead: true }))
    unreadCount.value = 0
  } catch {
    // non-critical
  }
}

async function onClickNotification(notif: Notification) {
  if (!notif.isRead) {
    try {
      await apiFetch(`/notifications/${notif.id}/read`, { method: 'PATCH' })
      notif.isRead = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch {
      // non-critical
    }
  }
  const mode = (auth.user as { notificationOpenMode?: string } | null)?.notificationOpenMode ?? 'inspector'
  if (mode === 'modal') {
    // Modal mode: go to the board without a keyId path param; the board will
    // open the modal separately once we add modal path support
    router.push({ name: 'board', params: { id: notif.projectId } })
  } else {
    router.push({ name: 'board-key', params: { id: notif.projectId, keyId: notif.keyId } })
  }
}

function actorLabel(notif: Notification): string {
  if (!notif.actor) return 'Someone'
  return notif.actor.name?.trim() || notif.actor.email
}

function titleFor(notif: Notification): string {
  const what = notif.type === 'MENTION' ? 'mentioned you' : 'commented on a key you are assigned to'
  const where = notif.key ? ` on ${notif.key.name}` : ''
  return `${actorLabel(notif)} ${what}${where}`
}

function commentExcerpt(notif: Notification): string {
  if (!notif.comment?.text) return ''
  const t = notif.comment.text
  return t.length > 80 ? t.slice(0, 80) + '…' : t
}

// Live delivery: DefaultLayout re-dispatches every frame of the project's
// WebSocket as a window event, so a new notification reaches the bell here.
function onGlobalWsMessage(e: Event) {
  const msg = (e as CustomEvent).detail as Record<string, unknown>
  if (msg.type !== 'notification.new') return
  unreadCount.value += 1
  if (loaded.value) notifications.value.unshift(msg.notification as Notification)
}

onMounted(async () => {
  window.addEventListener('verba:ws-message', onGlobalWsMessage)
  await fetchCount()
})

onUnmounted(() => {
  window.removeEventListener('verba:ws-message', onGlobalWsMessage)
})
</script>
