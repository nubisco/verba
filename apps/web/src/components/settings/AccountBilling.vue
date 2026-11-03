<template>
  <!-- The account's plan and billing, for its owners and admins, on an
       instance that sells hosted plans. Usage against the plan, the upgrade
       to Pro, and Paddle's customer portal for everything else (payment
       method, invoices, cancelling). The page never talks to Paddle: the API
       asks Nubisco's licenses service for a transaction, and the checkout runs
       on nubisco.io, the only domain Paddle allows it on. That page sends the
       buyer back here with ?checkout=done. -->
  <div class="billing">
    <NbInlineLoading v-if="loading && !state" label="Loading the plan" />
    <NbBanner v-else-if="loadError" status="error" variant="inline" :title="loadError" />

    <template v-if="state">
      <NbBanner v-if="notice" :status="notice.status" variant="callout" :title="notice.title">
        {{ notice.body }}
      </NbBanner>

      <NbPanel class="billing__section">
        <header class="billing__head">
          <div class="billing__title">
            <h3 class="type-heading-02 billing__plan">
              {{ planName }}
              <NbBadge v-if="state.state !== 'free'" size="sm" :variant="stateBadge.variant">
                {{ stateBadge.label }}
              </NbBadge>
            </h3>
            <p class="billing__lede">{{ planLede }}</p>
          </div>
          <div class="billing__actions">
            <NbButton v-if="state.subscription" variant="secondary" :loading="openingPortal" @click="manageBilling">
              Manage billing
            </NbButton>
            <NbButton v-if="state.salesUrl" variant="ghost" :href="state.salesUrl" target="_blank" rel="noopener">
              Contact sales
            </NbButton>
          </div>
        </header>

        <ul class="billing__meters" aria-label="Usage against the plan">
          <li v-for="m in meters" :key="m.key">
            <NbProgressBar
              :label="m.label"
              :value="m.value"
              :max="m.max"
              size="sm"
              :status="m.over ? 'error' : 'active'"
              :helper="m.helper"
            />
          </li>
        </ul>
      </NbPanel>

      <NbPanel v-if="state.plan === 'free' && state.source !== 'override'" class="billing__section">
        <header>
          <h3 class="type-heading-01">Upgrade to Pro</h3>
          <p class="billing__lede">
            Pro raises the limits on projects, members and translation keys. Every feature is on both plans: Pro only
            raises the limits. 14 days free, then billed {{ period === 'yearly' ? 'yearly' : 'monthly' }}. Prices
            exclude VAT.
          </p>
        </header>
        <div class="billing__form">
          <NbRadio v-model="period" name="billing-period" label="Billed" :options="PERIODS" />
          <div>
            <NbButton variant="primary" :loading="checkingOut" @click="upgrade">Start the free trial</NbButton>
          </div>
        </div>
      </NbPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@nubisco/ui'
import { apiFetch } from '../../api'

interface BillingSubscription {
  status: string
  plan: string
  billing: 'monthly' | 'yearly' | null
  current_period_end: string | null
  ends_at: string | null
  grace_until: string | null
}

interface BillingState {
  plan: string
  state: 'trialing' | 'active' | 'grace' | 'restricted' | 'free'
  source: 'subscription' | 'override' | 'free'
  subscription: BillingSubscription | null
  limits: Record<string, number | null>
  usage: Record<string, number>
  salesUrl: string | null
}

const props = defineProps<{ accountId: string }>()

const toast = useToast()
const route = useRoute()
const router = useRouter()

// What Paddle charges for Verba Pro, before VAT. Shown so the period can be
// chosen. The checkout on nubisco.io shows the final price.
const PERIODS = [
  { label: 'Monthly, $29 a month', value: 'monthly' },
  { label: 'Yearly, $290 a year (two months free)', value: 'yearly' },
]

const state = ref<BillingState | null>(null)
const loading = ref(false)
const loadError = ref('')
const period = ref<'monthly' | 'yearly'>('monthly')
const checkingOut = ref(false)
const openingPortal = ref(false)

const PLAN_NAMES: Record<string, string> = { free: 'Free', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' }
const planName = computed(() => PLAN_NAMES[state.value?.plan ?? 'free'] ?? state.value?.plan)

const stateBadge = computed(() => {
  switch (state.value?.state) {
    case 'trialing':
      return { label: 'Trial', variant: 'blue' as const }
    case 'active':
      return { label: 'Active', variant: 'green' as const }
    case 'grace':
      return { label: 'Payment due', variant: 'orange' as const }
    case 'restricted':
      return { label: 'Restricted', variant: 'red' as const }
    default:
      return { label: 'Free', variant: 'grey' as const }
  }
})

function day(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

const planLede = computed(() => {
  const s = state.value
  if (!s) return ''
  if (s.source === 'override') return 'This account is on an agreement with Nubisco. Contact sales to change it.'
  if (s.plan === 'free')
    return 'Every feature, within the limits below. Nothing is deleted when a limit is reached: you are asked to upgrade before adding more.'
  const billed = `Billed ${s.subscription?.billing ?? 'monthly'}.`
  const renews = s.subscription?.current_period_end
  return renews && !s.subscription?.ends_at ? `${billed} Renews on ${day(renews)}.` : billed
})

/** What is true about the subscription right now, if anything needs saying. */
const notice = computed(() => {
  const s = state.value
  if (!s) return null
  const sub = s.subscription
  if (s.state === 'trialing')
    return {
      status: 'info' as const,
      title: `Free trial until ${day(sub?.current_period_end)}`,
      body: 'The first payment is taken when the trial ends. Cancel before then from Manage billing and nothing is charged.',
    }
  if (s.state === 'grace')
    return {
      status: 'warning' as const,
      title: 'The last payment failed',
      body: `Pro limits stay until ${day(sub?.grace_until)}. Update the payment method in Manage billing to keep them.`,
    }
  if (s.state === 'restricted')
    return {
      status: 'error' as const,
      title: 'Back on Free limits',
      body: 'Payment did not go through, so the account is held to the Free limits. Nothing was deleted.',
    }
  if (sub?.ends_at)
    return {
      status: 'warning' as const,
      title: `Pro ends on ${day(sub.ends_at)}`,
      body: 'The subscription was cancelled. After that date the account moves to the Free limits. Nothing is deleted.',
    }
  return null
})

const METERS: { key: string; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'members', label: 'Members' },
  { key: 'keys', label: 'Translation keys' },
  { key: 'locales', label: 'Locales' },
]

const meters = computed(() => {
  const s = state.value
  if (!s) return []
  return METERS.map((m) => {
    const used = s.usage[m.key] ?? 0
    const cap = s.limits[m.key] ?? null
    const fmt = (n: number) => n.toLocaleString()
    return {
      key: m.key,
      label: m.label,
      value: cap === null ? 0 : Math.min(used, cap),
      max: cap ?? 1,
      over: cap !== null && used > cap,
      helper:
        cap === null
          ? `${fmt(used)}, no limit`
          : used > cap
            ? `${fmt(used)} of ${fmt(cap)}: over the limit`
            : `${fmt(used)} of ${fmt(cap)}`,
    }
  })
})

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

async function load(): Promise<void> {
  loading.value = true
  try {
    state.value = await apiFetch<BillingState>(`/accounts/${encodeURIComponent(props.accountId)}/billing`)
    loadError.value = ''
  } catch (err) {
    loadError.value = messageOf(err, 'The plan could not be loaded.')
  } finally {
    loading.value = false
  }
}

/**
 * The checkout page, told to come back to this tab. The page on nubisco.io
 * only follows a return address it allows, so elsewhere (a test deployment)
 * the buyer lands on the product page instead.
 */
function checkoutWithReturn(checkoutUrl: string): string {
  const back = new URL(window.location.href)
  back.search = ''
  back.hash = ''
  back.searchParams.set('section', 'billing')
  back.searchParams.set('checkout', 'done')
  const url = new URL(checkoutUrl)
  url.searchParams.set('return', back.toString())
  return url.toString()
}

async function upgrade(): Promise<void> {
  checkingOut.value = true
  try {
    const res = await apiFetch<{ checkoutUrl: string }>(
      `/accounts/${encodeURIComponent(props.accountId)}/billing/checkout`,
      { method: 'POST', body: JSON.stringify({ billing: period.value }) },
    )
    window.location.assign(checkoutWithReturn(res.checkoutUrl))
    // Leaving the page: the button keeps spinning until it is gone.
  } catch (err) {
    toast.error(messageOf(err, 'The checkout could not be opened.'))
    checkingOut.value = false
  }
}

async function manageBilling(): Promise<void> {
  // Opened before the request, so the browser treats it as the click's own
  // window rather than a popup to block.
  const tab = window.open('', '_blank')
  openingPortal.value = true
  try {
    const { url } = await apiFetch<{ url: string }>(`/accounts/${encodeURIComponent(props.accountId)}/billing/portal`, {
      method: 'POST',
    })
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else window.location.href = url
  } catch (err) {
    tab?.close()
    toast.error(messageOf(err, 'Billing could not be opened.'))
  } finally {
    openingPortal.value = false
  }
}

/**
 * Back from the checkout. load() already asked licenses, but the subscription
 * webhook can reach licenses a moment after the buyer does, so an account
 * still on Free is asked once more.
 */
async function welcomeBack(): Promise<void> {
  const rest = { ...route.query }
  delete rest.checkout
  void router.replace({ query: rest })
  if (state.value?.plan === 'free') {
    await new Promise((r) => window.setTimeout(r, 3000))
    await load()
  }
  if (state.value && state.value.plan !== 'free') toast.success('Welcome to Pro. Your trial has started.')
}

watch(
  () => props.accountId,
  () => void load(),
)

onMounted(async () => {
  await load()
  if (route.query.checkout === 'done') await welcomeBack()
})
</script>

<style scoped lang="scss">
.billing {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
}

.billing__section {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-16);

  h3 {
    margin: 0;
  }
}

.billing__head {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: var(--nb-spacing-16);
}

// The plan's name and lede take the room, and the actions go under them when
// the pane is too narrow for both (a narrow window, or a phone).
.billing__title {
  flex: 1 1 18rem;
  min-width: 0;
}

.billing__plan {
  display: flex;
  align-items: center;
  gap: var(--nb-spacing-8);
}

.billing__lede {
  max-width: 68ch;
  margin: var(--nb-spacing-4) 0 0;
  color: var(--nb-c-text-subtle);
  font-size: var(--nb-type-body-sm-size);
}

.billing__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nb-spacing-8);
}

.billing__meters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
  gap: var(--nb-spacing-16) var(--nb-spacing-24);
  margin: 0;
  padding: 0;
  list-style: none;
}

.billing__form {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-16);
  max-inline-size: 32rem;
}
</style>
