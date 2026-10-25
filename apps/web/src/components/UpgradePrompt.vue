<template>
  <div class="upgrade-prompt" :class="`upgrade-prompt--${variant}`">
    <div class="upgrade-prompt__icon">
      <span v-if="variant === 'saas'">⬆️</span>
      <span v-else>🔑</span>
    </div>
    <div class="upgrade-prompt__body">
      <p class="upgrade-prompt__title">{{ title }}</p>
      <p class="upgrade-prompt__message">{{ message }}</p>
      <a
        v-if="variant === 'saas'"
        :href="upgradeUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="upgrade-prompt__cta"
      >
        Upgrade plan
      </a>
      <a v-else href="mailto:licensing@nubisco.io" class="upgrade-prompt__cta"> Contact us for a license </a>
    </div>
  </div>
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

<style scoped>
.upgrade-prompt {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  border: 1px solid var(--nb-c-border);
  background: var(--nb-c-layer-2);
}

.upgrade-prompt--saas {
  border-color: var(--nb-c-info-surface-border);
  background: var(--nb-c-info-surface);
}

.upgrade-prompt--self-hosted {
  border-color: var(--nb-c-warning-surface-border);
  background: var(--nb-c-warning-surface);
}

.upgrade-prompt__icon {
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
}

.upgrade-prompt__body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.upgrade-prompt__title {
  margin: 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--nb-c-text);
}

.upgrade-prompt__message {
  margin: 0;
  font-size: 0.85rem;
  color: var(--nb-c-text-muted);
}

.upgrade-prompt__cta {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--nb-c-info);
  text-decoration: none;
}

.upgrade-prompt__cta:hover {
  text-decoration: underline;
}
</style>
