<template>
  <!-- The account's plan and entitlements, as the instance resolves them. It
       was /admin/entitlements, linked from nowhere. It now sits under the
       account's Settings, still for instance operators only: the API keeps
       requireAdmin on GET /admin/entitlements. -->
  <div class="account-plan">
    <NbInlineLoading v-if="store.loading" :label="t('common.loading')" />
    <NbMessage v-else-if="store.error" variant="error">{{ store.error }}</NbMessage>

    <template v-else-if="store.data">
      <NbPanel class="section">
        <h2 class="type-heading-01">Active plan</h2>
        <NbDefinitionList :items="planItems" />
        <div class="badges">
          <NbBadge variant="purple">{{ store.data.plan.name }}</NbBadge>
          <NbBadge v-if="store.data.hasOverride" variant="orange">override active</NbBadge>
        </div>
      </NbPanel>

      <NbPanel v-if="store.data.subscription" class="section">
        <h2 class="type-heading-01">Subscription</h2>
        <NbDefinitionList :items="subscriptionItems" />
      </NbPanel>

      <NbPanel v-if="store.data.licenseState.status !== 'none'" class="section">
        <h2 class="type-heading-01">License</h2>
        <NbDefinitionList :items="licenseItems" />
      </NbPanel>

      <NbPanel class="section">
        <h2 class="type-heading-01">Feature entitlements</h2>
        <p v-if="store.data.entitlements.features.length === 0" class="empty-note">
          No EE features enabled on this plan.
        </p>
        <div v-else class="badges">
          <NbBadge v-for="f in store.data.entitlements.features" :key="f" variant="green">{{ f }}</NbBadge>
        </div>
      </NbPanel>

      <NbPanel class="section">
        <h2 class="type-heading-01">Resource limits</h2>
        <NbDefinitionList :items="limitItems" />
      </NbPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEntitlementsStore } from '../../stores/entitlements'

const props = defineProps<{ accountId: string }>()

const { t } = useI18n()
const store = useEntitlementsStore()

watch(
  () => props.accountId,
  (id) => {
    if (id) void store.fetch(id)
  },
  { immediate: true },
)

function limitLabel(value: number | null): string {
  return value === null ? 'Unlimited' : String(value)
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString() : 'None'
}

const planItems = computed(() => {
  const d = store.data
  if (!d) return []
  return [
    { term: 'Plan ID', value: d.plan.id },
    { term: 'Mode', value: d.plan.managed ? 'Managed SaaS' : 'Self-hosted' },
    ...(d.billing
      ? [
          { term: 'Billing state', value: d.billing.state },
          { term: 'Plan source', value: d.billing.source },
          { term: 'Entitlement version', value: d.billing.version ?? 'None held' },
          { term: 'Fetched from licenses', value: formatDate(d.billing.fetchedAt) },
        ]
      : []),
  ]
})

const subscriptionItems = computed(() => {
  const s = store.data?.subscription
  if (!s) return []
  return [
    { term: 'Status', value: s.status },
    { term: 'Current period ends', value: formatDate(s.currentPeriodEnd) },
    { term: 'Cancel at period end', value: s.cancelAtPeriodEnd ? 'Yes' : 'No' },
  ]
})

const licenseItems = computed(() => {
  const l = store.data?.licenseState
  if (!l) return []
  return [
    { term: 'Status', value: l.status },
    { term: 'Licensee', value: l.licensee },
    { term: 'Seats', value: l.seats },
    { term: 'Expires', value: formatDate(l.expiresAt) },
  ]
})

const limitItems = computed(() => {
  const e = store.data?.entitlements
  if (!e) return []
  return [
    { term: 'Projects', value: limitLabel(e.maxProjects) },
    { term: 'Members', value: limitLabel(e.maxMembers ?? null) },
    { term: 'Keys', value: limitLabel(e.maxKeys ?? null) },
    { term: 'Locales', value: limitLabel(e.maxLocales ?? null) },
    { term: 'Seats per project', value: limitLabel(e.maxSeatsPerProject) },
    { term: 'Keys per project', value: limitLabel(e.maxKeysPerProject) },
    { term: 'Locales per project', value: limitLabel(e.maxLocalesPerProject) },
    { term: 'Monthly API calls', value: limitLabel(e.maxMonthlyApiCalls) },
  ]
})
</script>

<style scoped lang="scss">
.account-plan {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-12);
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nb-spacing-8);
}

.empty-note {
  margin: 0;
  color: var(--nb-c-text-subtle);
}
</style>
