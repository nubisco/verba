/**
 * useEntitlement: check feature entitlements client-side.
 *
 * Usage:
 *   const { entitled, loading } = useEntitlement('sso')
 *
 * The composable reads from the entitlements store. If the store hasn't been
 * populated yet it triggers a fetch. Components should show a loading state
 * while `loading` is true.
 *
 * For upgrade prompts, combine with the <UpgradePrompt> component:
 *   <UpgradePrompt v-if="!entitled" feature="sso" />
 */

import { computed, onMounted } from 'vue'
import { useEntitlementsStore } from '../stores/entitlements'

export function useEntitlement(feature: string) {
  const store = useEntitlementsStore()

  onMounted(() => {
    if (!store.data && !store.loading) {
      store.fetch()
    }
  })

  const loading = computed(() => store.loading)
  const entitled = computed(() => store.hasFeature(feature))
  const planId = computed(() => store.planId)
  const isManaged = computed(() => store.isManaged)

  return { entitled, loading, planId, isManaged }
}
