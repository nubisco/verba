<template>
  <!-- The account's Settings, behind the gear at the foot of the rail (fleet
       standard, "Every rail has the same anatomy"): the account itself, its
       people and their roles, its billing for owners and admins on an
       instance that sells hosted plans, and, for instance operators, its
       resolved plan. A project's own configuration is that project's
       Settings, and personal settings are in the user menu.

       One tab strip in the shell's fixedbar, the shape Acta's Settings set,
       with the tab in the URL. Which account these are is the trail's to
       say: its account crumb switches to another account's Settings, on the
       same tab, so there is no account picker on the page. -->
  <div class="settings">
    <component :is="fixedbar.Outlet">
      <NbTabs v-model="tab" :items="tabs" aria-label="Account settings sections" variant="line" />
    </component>

    <NbEmptyState
      v-if="accountsStore.loaded && !account"
      :title="t('dashboard.noAccountTitle')"
      :description="t('dashboard.noAccountBody')"
      bordered
    />

    <template v-else-if="account">
      <SettingsAccountGeneral v-if="tab === 'general'" :account="account" />
      <SettingsAccountMembers v-else-if="tab === 'members'" :account="account" />
      <AccountBilling v-else-if="tab === 'billing' && showBilling" :account-id="account.id" />
      <AccountPlan v-else-if="tab === 'plan' && isOperator" :account-id="account.id" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useShellSlot } from '@nubisco/ui'
import { useAuthStore } from '../stores/auth'
import { useAccountsStore } from '../stores/accounts'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { useSettingsTab, type SettingsTab } from '../composables/useSettingsTab'
import SettingsAccountGeneral from '../components/settings/SettingsAccountGeneral.vue'
import SettingsAccountMembers from '../components/settings/SettingsAccountMembers.vue'
import AccountPlan from '../components/settings/AccountPlan.vue'
import AccountBilling from '../components/settings/AccountBilling.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const accountsStore = useAccountsStore()
const instanceConfig = useInstanceConfigStore()
const fixedbar = useShellSlot('fixedbar')

const account = computed(() => accountsStore.current)
const isOperator = computed(() => Boolean(auth.user?.isGlobalAdmin))
// Billing is there only on an instance that sells hosted plans (the API says
// so in /config), and only for the account's owners and admins, who are the
// ones the API lets see it.
const showBilling = computed(() => instanceConfig.hasFeature('billing') && accountsStore.canManage)

const tabs = computed<SettingsTab[]>(() => [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  ...(showBilling.value ? [{ id: 'billing', label: 'Plan and billing' }] : []),
  ...(isOperator.value ? [{ id: 'plan', label: 'Plan and entitlements' }] : []),
])
const tab = useSettingsTab(tabs)

// ?account= (an id or a slug, as the API takes it) names the account, so the
// trail's switcher and a shared link open the right one. Without it, the
// account being worked in.
function selectFromRoute(): void {
  const wanted = route.query.account
  if (typeof wanted !== 'string' || !wanted) return
  const match = accountsStore.accounts.find((a) => a.id === wanted || a.slug === wanted)
  if (match) accountsStore.select(match.id)
}
watch([() => route.query.account, () => accountsStore.accounts], selectFromRoute)

onMounted(async () => {
  await accountsStore.ensureLoaded()
  selectFromRoute()
})
</script>

<style scoped lang="scss">
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
  padding-block-end: var(--nb-spacing-32);
}
</style>
