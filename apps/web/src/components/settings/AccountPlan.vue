<template>
  <!-- The account's plan and entitlements, as the instance resolves them. It
       was /admin/entitlements, linked from nowhere. It now sits under the
       account's Settings, still for instance operators only: the API keeps
       requireAdmin on GET /admin/entitlements. -->
  <div class="account-plan">
    <NbInlineLoading v-if="store.loading" :label="t('common.loading')" />
    <NbMessage v-else-if="store.error" variant="error">{{ store.error }}</NbMessage>

    <template v-else-if="store.data">
      <section class="section">
        <h3>Active plan</h3>
        <NbDefinitionList :items="planItems" />
        <div class="badges">
          <NbBadge variant="purple">{{ store.data.plan.name }}</NbBadge>
          <NbBadge v-if="store.data.hasOverride" variant="orange">override active</NbBadge>
        </div>
      </section>

      <section v-if="store.data.subscription" class="section">
        <h3>Subscription</h3>
        <NbDefinitionList :items="subscriptionItems" />
      </section>

      <section v-if="store.data.licenseState.status !== 'none'" class="section">
        <h3>License</h3>
        <NbDefinitionList :items="licenseItems" />
      </section>

      <section class="section">
        <h3>Feature entitlements</h3>
        <p v-if="store.data.entitlements.features.length === 0" class="empty-note">
          No EE features enabled on this plan.
        </p>
        <div v-else class="badges">
          <NbBadge v-for="f in store.data.entitlements.features" :key="f" variant="green">{{ f }}</NbBadge>
        </div>
      </section>

      <section class="section">
        <h3>Resource limits</h3>
        <NbDefinitionList :items="limitItems" />
      </section>
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

.section h3 {
  margin: 0 0 var(--nb-spacing-12);
  font-size: var(--nb-type-body-md-size);
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nb-spacing-8);
  margin-top: var(--nb-spacing-12);
}

.empty-note {
  margin: 0;
  color: var(--nb-c-text-subtle);
}
</style>
