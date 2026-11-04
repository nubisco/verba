<template>
  <!-- Asked of someone signed in who has not accepted the current terms: a
       new version (VERBA_TERMS_VERSION), or an account made through a
       provider's page, which is not ours to put a checkbox on. -->
  <div class="terms-page">
    <NbPanel class="terms-card">
      <img :src="logoSrc" alt="Verba" class="terms-logo" />
      <h1 class="type-heading-03 terms-title">Before you continue</h1>
      <p class="terms-lede">{{ lede }}</p>

      <template v-if="terms">
        <TermsConsent v-model="accepted" :terms="terms" />
        <p v-if="error" class="terms-error">{{ error }}</p>
        <NbButton variant="primary" size="lg" class="terms-btn" :disabled="!accepted" :loading="saving" @click="accept">
          Continue
        </NbButton>
      </template>
      <NbInlineLoading v-else label="Loading" />

      <p class="terms-other">
        <NbButton variant="link" @click="auth.logout()">Sign out</NbButton>
      </p>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TermsConsent from '../components/TermsConsent.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const logoSrc = `${import.meta.env.BASE_URL}logo.svg`

const accepted = ref(false)
const saving = ref(false)
const error = ref('')

const terms = computed(() => auth.user?.terms ?? null)
const lede = computed(
  () =>
    `Read and accept the terms of service and the privacy notice (version ${terms.value?.version ?? ''}) to use Verba.`,
)

function destination(): string {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('/accept-terms')
    ? target
    : '/projects'
}

onMounted(async () => {
  if (!auth.user) await auth.fetchMe()
  if (!auth.user) {
    void router.replace({ path: '/login', query: { redirect: destination() } })
    return
  }
  if (!auth.user.terms || auth.user.terms.accepted) void router.replace(destination())
})

async function accept(): Promise<void> {
  if (!terms.value) return
  saving.value = true
  error.value = ''
  try {
    await auth.acceptTerms(terms.value.version)
    await router.replace(destination())
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'The terms could not be accepted. Try again.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.terms-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--nb-spacing-16);
  background: var(--nb-c-bg);
}

.terms-card {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-16);
  width: 100%;
  max-width: 420px;
  padding: 2.5rem 2rem;
  box-shadow: 0 2px 16px color-mix(in srgb, var(--nb-c-black) 10%, transparent);
}

.terms-logo {
  align-self: center;
  height: 48px;
  width: auto;
}

.terms-title,
.terms-lede {
  margin: 0;
  text-align: center;
}

.terms-lede {
  color: var(--nb-c-text-subtle);
  font-size: var(--nb-type-body-sm-size);
}

.terms-error {
  margin: 0;
  color: var(--nb-c-status-error);
  font-size: 0.85rem;
  text-align: center;
}

.terms-btn {
  width: 100%;
}

.terms-other {
  margin: 0;
  text-align: center;
}
</style>
