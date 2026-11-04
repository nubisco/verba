<template>
  <!-- Across the account while it is over its hosted plan: everyone sees
       why, and owners and admins get the way out. Not rendered otherwise, and
       never on an instance without hosted plans. -->
  <div v-if="status?.readOnly" class="read-only-banner">
    <NbBanner status="warning" variant="callout" title="This account is read-only">
      {{ status.summary }} After the change of plan nothing was deleted, and everyone can still read and export.
      <template v-if="!checkout"> Delete some to make changes again, or contact sales to raise the limits. </template>
      <template v-else-if="accounts.canManage"> Delete some, or upgrade the plan, to make changes again. </template>
      <template v-else> An owner or admin can upgrade the plan, or delete some, to make changes again. </template>
      <template v-if="checkout && accounts.canManage" #action>
        <NbButton variant="secondary" size="sm" @click="seePlans">See plans</NbButton>
      </template>
      <template v-else-if="!checkout && salesUrl" #action>
        <NbButton variant="secondary" size="sm" :href="salesUrl" target="_blank" rel="noopener">Contact sales</NbButton>
      </template>
    </NbBanner>
  </div>
</template>

<script setup lang="ts">
/**
 * Asks GET /accounts/:id/plan-status when the account changes, on every
 * navigation, when a write is refused by the plan and after every write the
 * API accepted, so the banner goes as soon as the account is back under.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { onPlanLimit, onWrite } from '../planLimit'
import { useAccountsStore } from '../stores/accounts'
import { useInstanceConfigStore } from '../stores/instanceConfig'

interface PlanStatus {
  readOnly: boolean
  summary: string | null
}

const route = useRoute()
const router = useRouter()
const accounts = useAccountsStore()
const instanceConfig = useInstanceConfigStore()
const status = ref<PlanStatus | null>(null)
// Checkout closed (VERBA_CHECKOUT_OPEN): no See plans, Contact sales instead.
const checkout = computed(() => instanceConfig.hasFeature('checkout'))
const salesUrl = computed(() => instanceConfig.salesUrl)

let asked = 0
async function refresh(): Promise<void> {
  const account = accounts.current
  if (!account || !instanceConfig.hasFeature('billing')) {
    status.value = null
    return
  }
  const mine = ++asked
  try {
    const next = await apiFetch<PlanStatus>(`/accounts/${encodeURIComponent(account.id)}/plan-status`)
    if (mine === asked) status.value = next
  } catch {
    // Keep what is shown: a failed check is not a reason to hide or show it.
  }
}

function seePlans(): void {
  void router.push({ name: 'account-settings', query: { section: 'billing' } })
}

watch(
  () => [accounts.current?.id, instanceConfig.hasFeature('billing'), route.path],
  () => void refresh(),
)

const stops: (() => void)[] = []
onMounted(() => {
  void refresh()
  stops.push(
    onPlanLimit(() => void refresh()),
    onWrite(() => void refresh()),
  )
})
onUnmounted(() => stops.forEach((s) => s()))
</script>

<style scoped lang="scss">
// The shell already pads the main area: the banner lines up with the page
// below it and leaves it room.
.read-only-banner {
  margin-block-end: var(--nb-spacing-24);
}
</style>
