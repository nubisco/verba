<template>
  <div id="notif-bell-root" class="notif-bell" :class="{ 'sidebar-mode': sidebar }">
    <NbButton class="bell-btn" aria-label="Notifications" @click.stop="toggleDropdown">
      <NbIcon
        :name="unreadCount > 0 ? 'bell-ringing' : 'bell'"
        :animation="unreadCount > 0 ? 'mouse-pointer' : null"
        :size="18"
      />
      <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </NbButton>

    <div v-if="open" class="notif-dropdown" @click.stop>
      <div class="notif-header">
        <span class="notif-title">Notifications</span>
        <NbButton v-if="unreadCount > 0" variant="ghost" @click="markAllRead">Mark all read</NbButton>
      </div>

      <div class="notif-list">
        <div v-if="notifications.length === 0" class="notif-empty">No notifications yet</div>
        <div
          v-for="n in notifications"
          :key="n.id"
          class="notif-item"
          :class="{ unread: !n.isRead }"
          @click="onClickNotification(n)"
        >
          <div class="notif-text">
            <strong>{{ actorLabel(n) }}</strong> {{ typeLabel(n) }}
            <span v-if="n.key">
              on <em>{{ n.key.name }}</em></span
            >
          </div>
          <div v-if="n.comment" class="notif-excerpt">
            {{ commentExcerpt(n) }}
          </div>
          <div class="notif-time">{{ timeAgo(n.createdAt) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useAuthStore } from '../stores/auth'

withDefaults(defineProps<{ sidebar?: boolean }>(), { sidebar: false })

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

async function fetchCount() {
  try {
    const data = await apiFetch<{ count: number }>('/notifications/count')
    unreadCount.value = data.count
  } catch {
    // non-critical
  }
}

async function loadNotifications() {
  if (loaded.value) return
  try {
    notifications.value = await apiFetch<Notification[]>('/notifications')
    loaded.value = true
  } catch {
    // non-critical
  }
}

async function toggleDropdown() {
  open.value = !open.value
  if (open.value) await loadNotifications()
}

async function markAllRead() {
  try {
    await apiFetch('/notifications/read-all', { method: 'PATCH' })
    notifications.value = notifications.value.map((n) => ({
      ...n,
      isRead: true,
    }))
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
  open.value = false
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

function typeLabel(notif: Notification): string {
  return notif.type === 'MENTION' ? 'mentioned you' : 'commented on a key you are assigned to'
}

function commentExcerpt(notif: Notification): string {
  if (!notif.comment?.text) return ''
  const t = notif.comment.text
  return t.length > 80 ? t.slice(0, 80) + '…' : t
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Handle WS notification.new messages on the project WS connections.
// We subscribe globally using a shared event that can be emitted from any active useProjectWs instance.
function handleWsMessage(msg: Record<string, unknown>) {
  if (msg.type === 'notification.new') {
    const notif = msg.notification as Notification
    unreadCount.value += 1
    if (loaded.value) {
      notifications.value.unshift(notif)
    }
  }
}

// Register global WS message handler via custom event
function onGlobalWsMessage(e: Event) {
  handleWsMessage((e as CustomEvent).detail)
}

onMounted(async () => {
  await fetchCount()
  window.addEventListener('verba:ws-message', onGlobalWsMessage)
})

onUnmounted(() => {
  window.removeEventListener('verba:ws-message', onGlobalWsMessage)
})

// Close dropdown on outside click
function onDocClick(e: MouseEvent) {
  const el = document.getElementById('notif-bell-root')
  if (el && !el.contains(e.target as Node)) {
    open.value = false
  }
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<style lang="scss" scoped>
.notif-bell {
  position: relative;
}

.bell-btn {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  position: relative;
  line-height: 1;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.badge {
  position: absolute;
  top: -2px;
  right: -4px;
  background: #ef4444;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.05rem 0.25rem;
  border-radius: 999px;
  min-width: 14px;
  text-align: center;
  line-height: 1.4;
}

.notif-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 340px;
  max-height: 400px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// When embedded in the sidebar, open to the right instead of below
.sidebar-mode {
  .bell-btn {
    color: rgba(255, 255, 255, 0.55);
    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.9);
    }
  }
  .notif-dropdown {
    bottom: 0;
    top: auto;
    right: auto;
    left: calc(100% + 10px);
  }
}

.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.notif-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #1a1a2e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.notif-list {
  overflow-y: auto;
  flex: 1;
}

.notif-empty {
  padding: 1.5rem;
  text-align: center;
  color: #999;
  font-size: 0.85rem;
}

.notif-item {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  transition: background 0.12s;

  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: #f7f7fb;
  }

  &.unread {
    background: #f0f0ff;
    &:hover {
      background: #e8e8fb;
    }
  }
}

.notif-text {
  font-size: 0.8rem;
  color: #333;
  line-height: 1.4;
}

.notif-excerpt {
  font-size: 0.75rem;
  color: #777;
  margin-top: 0.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-time {
  font-size: 0.7rem;
  color: #aaa;
  margin-top: 0.2rem;
}
</style>
