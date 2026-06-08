<template>
  <NbShell :inspector-visible="inspectorVisible">
    <!-- ═══ Logo ═══ -->
    <template #sidebar-logo>
      <RouterLink to="/dashboard" data-tooltip="Verba">
        <img src="/logo.svg" width="32" height="32" alt="Verba logo" />
      </RouterLink>
    </template>

    <!-- ═══ Navigation ═══ -->
    <template #sidebar-nav>
      <!-- Global nav -->
      <NbSidebarLink
        v-for="item in navStore.globalItems"
        :key="item.routeName"
        :to="item.href"
        :tooltip="t(item.label)"
        :active="item.isActive"
        @click.prevent="router.push(item.href)"
      >
        <NbIcon :name="item.icon" :size="18" />
      </NbSidebarLink>

      <!-- Project section -->
      <template v-if="navStore.projectId && projectStore.project">
        <div class="sidebar-divider" />

        <RouterLink
          :to="`/projects/${navStore.projectId}`"
          class="sidebar-project-avatar"
          :data-tooltip="projectStore.project.name"
        >
          <img
            v-if="projectStore.project.avatar?.startsWith('data:image/')"
            :src="projectStore.project.avatar"
            class="sidebar-project-avatar__img"
            alt=""
          />
          <template v-else>{{ projectStore.project.avatar || avatarLetters(projectStore.project.name) }}</template>
        </RouterLink>

        <NbSidebarLink
          v-for="item in navStore.projectItems"
          :key="item.routeName"
          :to="item.href"
          :tooltip="t(item.label)"
          :active="item.isActive"
          @click.prevent="router.push(item.href)"
        >
          <NbIcon :name="item.icon" :size="18" />
        </NbSidebarLink>
      </template>
    </template>

    <!-- ═══ Bottom actions ═══ -->
    <template #sidebar-bottom>
      <NotificationBell sidebar />

      <NbSidebarLink
        ref="accountTriggerRef"
        :tooltip="auth.user ? displayName(auth.user) : 'Profile'"
        :active="accountMenuOpen"
        @click.prevent="toggleAccountMenu"
      >
        <div class="user-avatar-icon" :class="{ admin: auth.user?.isGlobalAdmin }">
          {{ userInitials }}
        </div>
      </NbSidebarLink>

      <NbSidebarLink
        v-if="availableLocales.length > 1"
        :tooltip="`Language: ${locale}`"
        @click="changeLocale(locale === 'en' ? 'pt' : 'en')"
      >
        <NbIcon name="globe" :size="18" />
      </NbSidebarLink>
    </template>

    <!-- ═══ Topbar ═══ -->
    <template #topbar-left>
      <AppBreadcrumbs />
    </template>
    <template #topbar-right>
      <div id="verba-topbar" />
    </template>

    <!-- ═══ Inspector ═══ -->
    <template #inspector>
      <div id="verba-inspector" class="verba-inspector-slot" />
    </template>

    <!-- ═══ Main content ═══ -->
    <RouterView />
  </NbShell>

  <!-- ═══ Account menu (rendered via Teleport from inside NbMenu) ═══ -->
  <NbMenu
    ref="accountMenuRef"
    v-model:open="accountMenuOpen"
    :min-width="240"
    :max-width="320"
    @close="accountMenuOpen = false"
  >
    <li v-if="auth.user" class="account-menu-header" role="presentation">
      <div class="account-menu-header__avatar">{{ userInitials }}</div>
      <div class="account-menu-header__text">
        <div class="account-menu-header__name">{{ auth.user.name || auth.user.email.split('@')[0] }}</div>
        <div class="account-menu-header__email">{{ auth.user.email }}</div>
      </div>
    </li>

    <NbMenuDivider v-if="otherIdentities.length > 0" />

    <NbMenuItem
      v-for="i in otherIdentities"
      :key="i.platform_sub"
      icon="user-switch"
      :label="`Switch to ${i.email}`"
      @select="onSwitch(i)"
    />

    <NbMenuDivider v-if="platformEnabled" />

    <NbMenuItem v-if="platformEnabled" icon="user-plus" label="Add another account" @select="onAddAccount" />
    <NbMenuItem icon="user" :label="t('profile.profile') || 'Profile'" @select="onProfile" />
    <NbMenuDivider />
    <NbMenuItem danger icon="sign-out" :label="t('auth.logout')" @select="onLogout" />
  </NbMenu>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'
import { useProjectStore } from '../stores/project'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { displayName } from '../composables/useDisplayName'
import { usePlatformIdentities, type PlatformIdentity } from '../composables/usePlatformIdentities'
import { useI18n } from 'vue-i18n'
import { setLocale } from '../i18n/index'
import { useLayoutSlots } from '../composables/useLayoutSlots'
import NotificationBell from '../components/NotificationBell.vue'
import AppBreadcrumbs from '../components/AppBreadcrumbs.vue'

const router = useRouter()
const auth = useAuthStore()
const navStore = useNavigationStore()
const projectStore = useProjectStore()
const instanceConfig = useInstanceConfigStore()
const { inspectorVisible } = useLayoutSlots()

// ── Account menu wiring ───────────────────────────────────────────────────
// Trigger: the avatar NbSidebarLink in the bottom of the sidebar. Menu items:
// other identities (switch), Add another account, Profile, Sign out.
// All identity actions delegate to usePlatformIdentities so the standalone
// ProfileView panel and this menu stay in sync.
const accountTriggerRef = ref<{ $el: HTMLElement } | null>(null)
const accountMenuRef = ref<{ setPosition: (rect: DOMRect) => void } | null>(null)
const accountMenuOpen = ref(false)
const platformEnabled = computed(() => instanceConfig.auth.platformEnabled)
const { identities, load: loadIdentities, switchTo, addAnother, remove } = usePlatformIdentities()
const otherIdentities = computed(() => identities.value.filter((i) => !i.is_active))

function toggleAccountMenu() {
  if (accountMenuOpen.value) {
    accountMenuOpen.value = false
    return
  }
  const triggerEl = accountTriggerRef.value?.$el
  if (triggerEl && accountMenuRef.value) {
    const rect = triggerEl.getBoundingClientRect()
    // Sidebar is on the left; we want the menu to appear to the right of the
    // trigger rather than below it. Pass a synthetic rect with top=row-top,
    // left=row-right to keep the menu vertically aligned with the avatar.
    accountMenuRef.value.setPosition({
      ...rect,
      top: rect.top,
      bottom: rect.top,
      left: rect.right + 8,
    } as DOMRect)
  }
  accountMenuOpen.value = true
}

async function onSwitch(identity: PlatformIdentity) {
  accountMenuOpen.value = false
  try {
    await switchTo(identity)
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to switch account.')
  }
}

function onAddAccount() {
  accountMenuOpen.value = false
  addAnother()
}

function onProfile() {
  accountMenuOpen.value = false
  router.push('/profile')
}

async function onLogout() {
  accountMenuOpen.value = false
  await auth.logout()
}

// Reference to keep `remove` from being tree-shaken when only the trigger is
// used: the actual call lives on ProfileView. (No-op binding.)
void remove

watch(
  () => navStore.projectId,
  (id) => {
    if (id) projectStore.loadName(id).catch(() => {})
  },
  { immediate: true },
)

onMounted(async () => {
  if (!auth.user) await auth.fetchMe()
  if (platformEnabled.value) void loadIdentities()
})

const { t, locale } = useI18n()

const availableLocales = [{ code: 'en', name: 'English' }]

async function changeLocale(code: string) {
  await setLocale(code)
}

const WS_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000')).replace(
  /^http/,
  'ws',
)
watch(
  () => navStore.projectId,
  (id, _prev, onCleanup) => {
    if (!id) return
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      ws = new WebSocket(`${WS_BASE}/ws/projects/${id}`)
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          window.dispatchEvent(new CustomEvent('verba:ws-message', { detail: msg }))
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = () => {
        ws = null
        reconnectTimer = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws?.close()
    }
    connect()

    onCleanup(() => {
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      ws?.close()
    })
  },
  { immediate: true },
)

function avatarLetters(name: string) {
  return name.slice(0, 2).toUpperCase()
}

const userInitials = computed(() => {
  const u = auth.user
  if (!u) return '?'
  const n = u.name?.trim()
  if (n) {
    const parts = n.split(' ')
    return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : n.slice(0, 2).toUpperCase()
  }
  return u.email.slice(0, 2).toUpperCase()
})
</script>

<style scoped lang="scss">
// Project avatar section header
.sidebar-divider {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0.4rem 0;
  flex-shrink: 0;
}

.sidebar-project-avatar {
  width: 32px;
  height: 32px;
  background: rgba(124, 58, 237, 0.3);
  border: 1.5px solid rgba(167, 139, 250, 0.4);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 700;
  color: #c4b5fd;
  letter-spacing: 0.03em;
  text-decoration: none;
  margin: 0.25rem 0;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: background 0.15s;

  &:hover {
    background: rgba(124, 58, 237, 0.45);
  }

  &[data-tooltip]::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: rgba(15, 15, 30, 0.95);
    color: #fff;
    padding: 0.3rem 0.65rem;
    border-radius: 5px;
    font-size: 0.76rem;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 500;
  }

  &[data-tooltip]:hover::after {
    opacity: 1;
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    display: block;
  }
}

// User initials avatar (used inside NbSidebarLink)
.user-avatar-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.02em;

  &.admin {
    border-color: #a78bfa;
    color: #c4b5fd;
  }
}

// Inspector slot content area
.verba-inspector-slot {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}
</style>

<!-- Menu lives in document.body via Teleport, so its styles must be unscoped. -->
<style lang="scss">
.account-menu-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.85rem;
  list-style: none;
}

.account-menu-header__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1a1a2e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.account-menu-header__text {
  min-width: 0;
  flex: 1;
}

.account-menu-header__name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #111;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-menu-header__email {
  font-size: 0.75rem;
  color: #888;
  line-height: 1.2;
  margin-top: 0.1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
