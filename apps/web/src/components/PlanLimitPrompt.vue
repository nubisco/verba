<template>
  <NbModal :open="limit !== null" :title="title" size="sm" @close="limit = null">
    <p class="plan-limit__body">{{ limit?.message }}</p>
    <p v-if="!accounts.canManage" class="plan-limit__body">
      An owner or admin of this account can upgrade it from Settings, Billing.
    </p>
    <template #footer>
      <NbButton variant="secondary" @click="limit = null">Close</NbButton>
      <NbButton v-if="accounts.canManage" variant="primary" @click="seePlans">See plans</NbButton>
    </template>
  </NbModal>
</template>

<script setup lang="ts">
/**
 * The upgrade prompt, the same for every create flow: a project, a person
 * added to the account, a key, an import. The API refuses with 402
 * `plan_limit` and this opens with its words. It only opens on an instance
 * that sells hosted plans, because nothing is refused anywhere else.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { onPlanLimit, type PlanLimit } from '../planLimit'
import { useAccountsStore } from '../stores/accounts'
import { useInstanceConfigStore } from '../stores/instanceConfig'

const router = useRouter()
const accounts = useAccountsStore()
const instanceConfig = useInstanceConfigStore()
const limit = ref<PlanLimit | null>(null)
const title = computed(() => (limit.value?.readOnly ? 'This account is read-only' : "This account's plan is full"))

let stop: (() => void) | null = null
onMounted(() => {
  stop = onPlanLimit((l) => {
    if (instanceConfig.hasFeature('billing')) limit.value = l
  })
})
onUnmounted(() => stop?.())

function seePlans(): void {
  limit.value = null
  void router.push({ name: 'account-settings', query: { section: 'billing' } })
}
</script>

<style scoped lang="scss">
.plan-limit__body {
  margin: 0 0 var(--nb-spacing-12);
}
</style>
