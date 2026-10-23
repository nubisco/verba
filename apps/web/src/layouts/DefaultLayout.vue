<template>
  <!-- The rail collapses from the top, beside the brand (the fleet standard in
       the workspace AGENTS.md). One NbSidebarMenu serves both states: a
       labelled row expanded, an icon with a flyout label collapsed. The choice
       is the person's, remembered per browser, never the route's. On a phone
       the rail is a drawer, the shell renders no header toggle there, and the
       drawer always shows labels. -->
  <NbShell
    :inspector-visible="inspectorVisible"
    :sidebar-variant="nav.variant.value"
    sidebar-header-action-position="start"
    sidebar-header-action-compact="swap"
  >
    <!-- ═══ Brand ═══ -->
    <!-- The brand is only the brand. Picking a project is Home, the first
         entry in the rail. -->
    <template #sidebar-logo>
      <RouterLink to="/dashboard" class="sidebar-brand-link" aria-label="Verba, home">
        <NbSidebarBrand title="Verba">
          <template #icon>
            <img src="/logo.svg" width="28" height="28" alt="" />
          </template>
        </NbSidebarBrand>
      </RouterLink>
    </template>

    <template #sidebar-header-action>
      <NbSidebarHeaderToggle @toggle="nav.toggle" />
    </template>

    <!-- ═══ Navigation ═══ -->
    <template #sidebar-nav>
      <NbSidebarMenu density="compact">
        <!-- Global nav. Home is where the person picks the project. -->
        <NbSidebarMenuItem
          v-for="item in navStore.globalItems"
          :key="item.routeName"
          :label="t(item.label)"
          :icon="item.icon"
          :to="item.href"
          :active="item.isActive"
        />

        <!-- The selected project, then its destinations. -->
        <NbSidebarMenuGroup v-if="navStore.projectId && projectStore.project" :label="projectStore.project.name">
          <NbSidebarMenuItem
            v-for="item in navStore.projectItems"
            :key="item.routeName"
            :label="t(item.label)"
            :icon="item.icon"
            :to="item.href"
            :active="item.isActive"
          />
        </NbSidebarMenuGroup>
      </NbSidebarMenu>
    </template>

    <!-- ═══ Bottom actions ═══ -->
    <template #sidebar-bottom>
      <NotificationBell />

      <!-- `identity` follows the rail: a labelled row with name and email
           expanded, the round avatar collapsed. -->
      <NbUserMenu
        v-if="auth.user"
        :user="menuUser"
        :accounts="accounts"
        :accounts-unknown="accountsUnknown"
        :show-account-actions="platformEnabled"
        trigger="identity"
        @open="loadAccounts()"
        @switch="switchTo"
        @switch-account="selectAccount"
        @add-account="addAccount"
        @remove="remove"
        @profile="router.push('/profile')"
        @sign-out="auth.logout()"
      />

      <NbSidebarMenu v-if="availableLocales.length > 1" density="compact">
        <NbSidebarMenuItem
          :label="`Language: ${locale}`"
          icon="globe"
          @click="changeLocale(locale === 'en' ? 'pt' : 'en')"
        />
      </NbSidebarMenu>
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
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSidebarVariant } from '@nubisco/ui'
import { useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'
import { useProjectStore } from '../stores/project'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { usePlatformAccounts } from '../composables/usePlatformAccounts'
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

// Expanded or collapsed rail: the person's choice, remembered under a namespaced
// key and starting expanded. Never derived from the route.
const nav = useSidebarVariant({ storageKey: 'verba.sidebar' })

// ── Account menu wiring (NbUserMenu) ──────────────────────────────────────
// The standardized menu is presentation-only; identity data and the SSO
// redirect flows live in usePlatformAccounts. When this instance does not use
// platform auth it is single-account: account actions are hidden entirely.
const platformEnabled = computed(() => instanceConfig.auth.platformEnabled)
const {
  accounts,
  accountsUnknown,
  load: loadAccounts,
  switchTo,
  selectAccount,
  addAccount,
  remove,
} = usePlatformAccounts()

const menuUser = computed(() => ({
  email: auth.user?.email ?? '',
  name: auth.user?.name ?? undefined,
}))

watch(
  () => navStore.projectId,
  (id) => {
    if (id) projectStore.loadName(id).catch(() => {})
  },
  { immediate: true },
)

onMounted(async () => {
  if (!auth.user) await auth.fetchMe()
  if (platformEnabled.value) void loadAccounts()
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
</script>

<style scoped lang="scss">
// The brand links home. It takes the row the shell gives it and draws nothing
// of its own.
.sidebar-brand-link {
  display: flex;
  min-width: 0;
  width: 100%;
  color: inherit;
  text-decoration: none;
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
