<template>
  <!-- What belongs to the person alone, reached from the user menu's "Your
       settings" (fleet standard, "Settings live at three levels"). One tab
       strip in the shell's fixedbar, as in Acta's Your settings, with the tab
       in the URL. Name, picture and passkeys are the identity provider's
       when this instance signs in through it, so "Your account" then holds
       only what Verba keeps. -->
  <div class="settings">
    <component :is="fixedbar.Outlet">
      <NbTabs v-model="tab" :items="tabs" aria-label="Your settings sections" variant="line" />
    </component>

    <template v-if="tab === 'preferences'">
      <NbPanel class="settings__section">
        <header>
          <h2 class="type-heading-01">{{ t('profile.preferences') }}</h2>
          <p class="settings__lede">How Verba works for you, on every device you sign in on.</p>
        </header>
        <form class="settings__form" @submit.prevent="savePreferences">
          <LocaleMultiSelect
            id="preferred-locales"
            v-model="preferredLocales"
            :label="t('profile.preferredLocales')"
            :helper="t('profile.preferredLocalesHint')"
            :options="KNOWN_LOCALES"
            value-field="code"
          />
          <NbRadio
            v-model="notificationOpenMode"
            name="notification-open-mode"
            label="Open notifications with"
            direction="horizontal"
            :options="[
              { label: 'Inspector', value: 'inspector' },
              { label: 'Modal', value: 'modal' },
            ]"
          />
          <div class="settings__actions">
            <NbButton type="submit" variant="primary" :loading="savingPreferences">Save</NbButton>
          </div>
        </form>
      </NbPanel>
    </template>

    <template v-else-if="tab === 'account'">
      <NbPanel class="settings__section">
        <header>
          <h2 class="type-heading-01">{{ platformEnabled ? 'Your account' : t('profile.accountDetails') }}</h2>
          <p v-if="platformEnabled" class="settings__lede">
            Your name, picture and passkeys are your Nubisco profile's, which the user menu's Profile opens.
          </p>
        </header>
        <NbDefinitionList :items="accountItems" />
        <form v-if="!platformEnabled" class="settings__form" @submit.prevent="saveIdentity">
          <NbTextInput
            id="profile-name"
            v-model="name"
            :label="t('profile.name')"
            :placeholder="t('profile.namePlaceholder')"
          />
          <NbTextInput
            id="profile-email"
            v-model="email"
            :label="t('profile.email')"
            type="email"
            :placeholder="t('profile.emailPlaceholder')"
            required
          />
          <div class="settings__actions">
            <NbButton type="submit" variant="primary" :loading="savingIdentity" :disabled="!identityDirty">
              Save
            </NbButton>
          </div>
        </form>
      </NbPanel>

      <NbPanel v-if="!platformEnabled" class="settings__section">
        <header>
          <h2 class="type-heading-01">Password</h2>
        </header>
        <form class="settings__form" @submit.prevent="savePassword">
          <NbBanner v-if="passwordError" status="error" variant="inline" :title="passwordError" />
          <NbTextInput
            id="current-password"
            v-model="currentPassword"
            :label="t('profile.currentPassword')"
            type="password"
            autocomplete="current-password"
            required
          />
          <NbTextInput
            id="new-password"
            v-model="newPassword"
            :label="t('profile.newPassword')"
            type="password"
            autocomplete="new-password"
            helper="At least 8 characters."
            required
          />
          <NbTextInput
            id="confirm-password"
            v-model="confirmPassword"
            :label="t('profile.confirmPassword')"
            type="password"
            autocomplete="new-password"
            required
          />
          <div class="settings__actions">
            <NbButton type="submit" variant="primary" :loading="savingPassword" :disabled="!newPassword">
              {{ t('profile.changePasswordBtn') }}
            </NbButton>
          </div>
        </form>
      </NbPanel>

      <NbPanel class="settings__section">
        <header class="settings__head">
          <div>
            <h2 class="type-heading-01">Deactivate your account</h2>
            <p class="settings__lede">{{ t('profile.dangerHint') }}</p>
          </div>
          <NbButton variant="danger" @click="deactivateAccount">{{ t('profile.deactivate') }}</NbButton>
        </header>
      </NbPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm, useShellSlot, useToast } from '@nubisco/ui'
import { useAuthStore } from '../stores/auth'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { apiFetch } from '../api'
import LocaleMultiSelect from '../components/LocaleMultiSelect.vue'
import { KNOWN_LOCALES } from '../utils/localeUtils'
import { useSettingsTab, type SettingsTab } from '../composables/useSettingsTab'

interface Me {
  id: string
  email: string
  name: string | null
  isGlobalAdmin: boolean
  preferredLocales?: string[]
  notificationOpenMode?: string
}

const auth = useAuthStore()
const instanceConfig = useInstanceConfigStore()
const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const fixedbar = useShellSlot('fixedbar')

// The identity fields are the identity provider's when this instance signs in
// through it.
const platformEnabled = computed(() => instanceConfig.auth.platformEnabled)

const tabs = ref<SettingsTab[]>([
  { id: 'preferences', label: 'Preferences' },
  { id: 'account', label: 'Your account' },
])
const tab = useSettingsTab(tabs)

/** One PATCH /auth/me, then the signed-in user follows what the server kept. */
async function patchMe(body: Record<string, unknown>): Promise<Me> {
  const updated = await apiFetch<Me>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) })
  auth.user = {
    ...auth.user!,
    email: updated.email,
    name: updated.name,
    isGlobalAdmin: updated.isGlobalAdmin,
    notificationOpenMode: updated.notificationOpenMode ?? 'inspector',
  }
  return updated
}

// ── Preferences ────────────────────────────────────────────────────────────
const preferredLocales = ref<string[]>([])
const notificationOpenMode = ref<'inspector' | 'modal'>('inspector')
const savingPreferences = ref(false)

async function savePreferences(): Promise<void> {
  savingPreferences.value = true
  try {
    const updated = await patchMe({
      preferredLocales: preferredLocales.value,
      notificationOpenMode: notificationOpenMode.value,
    })
    preferredLocales.value = updated.preferredLocales ?? []
    notificationOpenMode.value = (updated.notificationOpenMode as 'inspector' | 'modal') ?? 'inspector'
    toast.success('Saved')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save your preferences')
  } finally {
    savingPreferences.value = false
  }
}

onMounted(async () => {
  try {
    const me = await apiFetch<Me>('/auth/me')
    preferredLocales.value = me.preferredLocales ?? []
    notificationOpenMode.value = (me.notificationOpenMode as 'inspector' | 'modal') ?? 'inspector'
  } catch {
    // The form keeps its defaults, and saving still works.
  }
})

// ── Your account ───────────────────────────────────────────────────────────
const accountItems = computed(() => [
  ...(platformEnabled.value ? [{ term: t('profile.email'), value: auth.user?.email ?? '' }] : []),
  // An operator named in VERBA_OPERATORS manages this instance's accounts.
  { term: 'On this instance', value: auth.user?.isGlobalAdmin ? 'Operator' : 'Member' },
])

const name = ref(auth.user?.name ?? '')
const email = ref(auth.user?.email ?? '')
const savingIdentity = ref(false)
const identityDirty = computed(
  () => name.value !== (auth.user?.name ?? '') || (email.value.trim() !== '' && email.value !== auth.user?.email),
)

async function saveIdentity(): Promise<void> {
  savingIdentity.value = true
  try {
    const body: Record<string, unknown> = {}
    if (name.value !== (auth.user?.name ?? '')) body.name = name.value
    if (email.value !== auth.user?.email) body.email = email.value
    const updated = await patchMe(body)
    name.value = updated.name ?? ''
    email.value = updated.email
    toast.success('Saved')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save your details')
  } finally {
    savingIdentity.value = false
  }
}

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)
const passwordError = ref('')

async function savePassword(): Promise<void> {
  passwordError.value = ''
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'The new passwords do not match.'
    return
  }
  if (newPassword.value.length < 8) {
    passwordError.value = 'The new password needs at least 8 characters.'
    return
  }
  savingPassword.value = true
  try {
    await patchMe({ currentPassword: currentPassword.value, newPassword: newPassword.value })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    toast.success(t('profile.passwordChanged'))
  } catch (e) {
    passwordError.value = e instanceof Error ? e.message : 'Could not change the password'
  } finally {
    savingPassword.value = false
  }
}

async function deactivateAccount(): Promise<void> {
  const done = await confirm({
    title: 'Deactivate your account',
    subjectLabel: 'Account',
    subject: auth.user?.email ?? '',
    message: t('profile.dangerHint'),
    confirmLabel: t('profile.deactivate'),
    onConfirm: async () => {
      await apiFetch('/auth/me/deactivate', { method: 'POST' })
    },
  })
  if (!done) return
  auth.user = null
  window.location.href = '/login'
}
</script>

<style scoped lang="scss">
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
  padding-block-end: var(--nb-spacing-32);

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--nb-spacing-16);
  }

  &__head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--nb-spacing-16);
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--nb-spacing-16);
  }

  &__lede {
    max-width: 68ch;
    margin: var(--nb-spacing-4) 0 0;
    color: var(--nb-c-text-subtle);
    font-size: var(--nb-type-body-sm-size);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}

// A phone: the deactivate button goes under its description.
@include variables.phone {
  .settings__head {
    flex-wrap: wrap;
  }
}
</style>
