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
    <!-- The order every rail keeps (fleet standard, "Every rail has the same
         anatomy"): Documentation, Notifications, the account's Settings, the
         person. -->
    <template #sidebar-bottom>
      <!-- A new tab, so leaving to read the docs does not lose the page. -->
      <NbSidebarMenu density="compact">
        <NbSidebarMenuItem icon="book" label="Documentation" :href="DOCS_URL" @click.prevent="openDocs" />
      </NbSidebarMenu>

      <NotificationBell />

      <!-- The account's Settings (members, roles, and the plan for operators),
           for the people allowed to change them. A project's own
           configuration is the last item of its group above. -->
      <NbSidebarMenu v-if="showAccountSettings" density="compact">
        <NbSidebarMenuItem
          icon="gear"
          :label="t('nav.accountSettings')"
          to="/settings"
          :active="route.name === 'account-settings'"
        />
      </NbSidebarMenu>

      <!-- `identity` follows the rail: a labelled row with the picture, name
           and email expanded, the round avatar collapsed. Personal settings
           (language) live in this menu. An operator gets the role badge, a
           warning ring on the avatar and a role row in the panel. The
           "Powered by Nubisco Platform" footer shows only when Platform signs
           people in. Theme stays off (no show-theme) until the views move to
           the ui tokens, see main.ts. -->
      <NbUserMenu
        v-if="auth.user"
        :user="menuUser"
        :accounts="accounts"
        :accounts-unknown="accountsUnknown"
        :show-account-actions="platformEnabled"
        :show-profile="platformEnabled"
        :brand="platformEnabled ? 'footer' : 'none'"
        :role-badge="isOperator ? t('nav.operatorBadge') : undefined"
        trigger="identity"
        @open="loadAccounts()"
        @switch="switchTo"
        @switch-account="selectAccount"
        @add-account="addAccount"
        @remove="remove"
        @profile="openProfile"
        @sign-out="auth.logout()"
      >
        <template #default="{ close }">
          <div v-if="availableLocales.length > 1" class="user-language">
            <p class="user-language__title">Language</p>
            <NbRadio
              name="user-menu-language"
              :options="localeOptions"
              :model-value="locale"
              @update:model-value="changeLocale(String($event))"
            />
          </div>
          <!-- What only Verba keeps about the person: preferred languages,
               how notifications open, and, on an instance with its own
               accounts, the name, email and password. -->
          <NbMenuItem icon="user-gear" :label="t('nav.yourSettings')" @select="openPersonalSettings(close)" />
        </template>
      </NbUserMenu>
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
import { useRoute, useRouter } from 'vue-router'
import { useSidebarVariant } from '@nubisco/ui'
import { useAuthStore } from '../stores/auth'
import { useNavigationStore } from '../stores/navigation'
import { useProjectStore } from '../stores/project'
import { useAccountsStore } from '../stores/accounts'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { usePlatformAccounts } from '../composables/usePlatformAccounts'
import { useI18n } from 'vue-i18n'
import { setLocale } from '../i18n/index'
import { useLayoutSlots } from '../composables/useLayoutSlots'
import NotificationBell from '../components/NotificationBell.vue'
import AppBreadcrumbs from '../components/AppBreadcrumbs.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const navStore = useNavigationStore()
const projectStore = useProjectStore()
const accountsStore = useAccountsStore()
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

// The picture is Platform's OIDC `picture` claim, stored at sign-in. Without
// one NbUserMenu draws initials.
const menuUser = computed(() => ({
  email: auth.user?.email ?? '',
  name: auth.user?.name ?? undefined,
  picture: auth.user?.avatarUrl ?? undefined,
}))

// Profile is Platform's (name, picture, passkeys), so it opens the person's
// Platform profile in a new tab. An instance without Platform hides it.
function openProfile(): void {
  const issuer = instanceConfig.auth.platformIssuer
  if (!issuer) return
  window.open(`${issuer.replace(/\/$/, '')}/profile`, '_blank', 'noopener')
}

function openPersonalSettings(close: () => void): void {
  close()
  void router.push({ name: 'personal-settings' })
}

const DOCS_URL = 'https://docs.nubisco.io/verba/'
function openDocs(): void {
  window.open(DOCS_URL, '_blank', 'noopener')
}

watch(
  () => navStore.projectId,
  (id) => {
    if (id) projectStore.loadName(id).catch(() => {})
  },
  { immediate: true },
)

// Owners and admins of the current account, and instance operators (who see
// its plan there).
const showAccountSettings = computed(() => accountsStore.canManage || Boolean(auth.user?.isGlobalAdmin))

// Elevated powers on this instance: an operator named in VERBA_OPERATORS, or a
// Platform admin of this app (both may create accounts). The user menu marks
// them so they remember they can do more here than usual.
const isOperator = computed(() => Boolean(auth.user?.isGlobalAdmin || auth.user?.canCreateAccounts))

onMounted(async () => {
  if (!auth.user) await auth.fetchMe()
  void accountsStore.ensureLoaded()
  if (platformEnabled.value) void loadAccounts()
})

const { t, locale } = useI18n()

const availableLocales = [{ code: 'en', name: 'English' }]
const localeOptions = availableLocales.map((l) => ({ label: l.name, value: l.code }))

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

// The language choice in the account menu, laid out as Acta and the CMS lay
// out their Appearance choice there.
.user-language {
  padding: var(--nb-spacing-8) var(--nb-spacing-12);

  &__title {
    margin: 0 0 var(--nb-spacing-8);
    color: var(--nb-c-text-subtle);
    font-size: var(--nb-type-body-sm-size);
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
