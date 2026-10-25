<template>
  <NbBanner :status="variant === 'saas' ? 'info' : 'warning'" variant="callout" :title="title">
    {{ message }}
    <template #action>
      <NbButton
        v-if="variant === 'saas'"
        :href="upgradeUrl"
        target="_blank"
        rel="noopener noreferrer"
        variant="secondary"
        size="sm"
      >
        Upgrade plan
      </NbButton>
      <NbButton v-else href="mailto:licensing@nubisco.io" variant="secondary" size="sm">
        Contact us for a license
      </NbButton>
    </template>
  </NbBanner>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** The EntitlementFeature string that is not accessible. Used in the message. */
    feature?: string
    /**
     * 'saas'       : managed SaaS instance, show an upgrade-plan CTA
     * 'self-hosted': self-hosted instance, show a license contact CTA
     * 'auto'       : (default) detect from the entitlements store
     */
    variant?: 'saas' | 'self-hosted' | 'auto'
    /** Custom title override. */
    title?: string
    /** Custom message override. */
    message?: string
  }>(),
  {
    feature: undefined,
    variant: 'auto',
    title: undefined,
    message: undefined,
  },
)

// When variant is 'auto', resolve from the store.
import { useEntitlementsStore } from '../stores/entitlements'
const store = useEntitlementsStore()

const variant = computed<'saas' | 'self-hosted'>(() => {
  if (props.variant === 'saas') return 'saas'
  if (props.variant === 'self-hosted') return 'self-hosted'
  // auto: managed instances show SaaS upgrade, self-hosted instances show license prompt
  return store.isManaged ? 'saas' : 'self-hosted'
})

const featureLabel = computed(() =>
  props.feature ? props.feature.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'This feature',
)

const title = computed(() => {
  if (props.title) return props.title
  return variant.value === 'saas' ? 'Upgrade your plan' : 'Enterprise license required'
})

const message = computed(() => {
  if (props.message) return props.message
  if (variant.value === 'saas') {
    return `${featureLabel.value} is not available on your current plan. Upgrade to unlock it.`
  }
  return `${featureLabel.value} requires an active Enterprise Edition license. Contact Nubisco to get started.`
})

const upgradeUrl = computed(() => {
  const base = import.meta.env.VITE_UPGRADE_URL ?? 'https://verba.io/pricing'
  return props.feature ? `${base}?feature=${props.feature}` : base
})
</script>
