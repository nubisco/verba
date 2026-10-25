<template>
  <div>
    <NbPanel class="card">
      <h3>{{ platformEnabled ? t('profile.preferences') : t('profile.accountDetails') }}</h3>

      <!-- Name, email and password are the person's identity. On an instance
           that signs in through Nubisco Platform they belong to Platform,
           which the user menu's Profile opens, so only an instance with its
           own accounts edits them here. -->
      <div v-if="!platformEnabled" class="field">
        <NbTextInput
          v-model="name"
          :label="t('profile.name')"
          type="text"
          :placeholder="t('profile.namePlaceholder')"
        />
      </div>

      <div v-if="!platformEnabled" class="field">
        <NbTextInput
          v-model="email"
          :label="t('profile.email')"
          type="email"
          :placeholder="t('profile.emailPlaceholder')"
        />
      </div>

      <div class="field">
        <LocaleMultiSelect
          v-model="preferredLocales"
          :label="t('profile.preferredLocales')"
          :options="KNOWN_LOCALES"
          value-field="code"
        />
      </div>

      <div class="field">
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
      </div>

      <template v-if="!platformEnabled">
        <div class="section-divider">{{ t('profile.changePassword') }}</div>
        <p class="section-hint">{{ t('profile.changePasswordHint') }}</p>

        <div class="field">
          <NbTextInput
            v-model="currentPassword"
            :label="t('profile.currentPassword')"
            type="password"
            autocomplete="current-password"
          />
        </div>
        <div class="field">
          <NbTextInput
            v-model="newPassword"
            :label="t('profile.newPassword')"
            type="password"
            autocomplete="new-password"
          />
        </div>
        <div class="field">
          <NbTextInput
            v-model="confirmPassword"
            :label="t('profile.confirmPassword')"
            type="password"
            autocomplete="new-password"
          />
        </div>
      </template>

      <NbBanner v-if="error" status="error" class="alert">{{ error }}</NbBanner>
      <NbBanner v-if="success" status="success" class="alert">{{ success }}</NbBanner>

      <div class="form-actions">
        <NbButton variant="primary" :disabled="saving" @click="save">
          {{ saving ? t('profile.savingProfile') : t('profile.saveProfile') }}
        </NbButton>
      </div>
    </NbPanel>

    <NbPanel class="card info-card">
      <h3>{{ t('profile.accountInfo') }}</h3>
      <dl>
        <dt>{{ t('profile.role') }}</dt>
        <dd>
          {{ auth.user?.isGlobalAdmin ? t('profile.globalAdmin') : t('profile.user') }}
        </dd>
      </dl>
    </NbPanel>

    <NbPanel class="card danger-card">
      <h3>{{ t('profile.dangerZone') }}</h3>
      <p class="section-hint">{{ t('profile.dangerHint') }}</p>
      <NbButton variant="danger" @click="deactivateAccount">
        {{ t('profile.deactivate') }}
      </NbButton>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { apiFetch } from '../api'
import LocaleMultiSelect from '../components/LocaleMultiSelect.vue'
import { useI18n } from 'vue-i18n'

const auth = useAuthStore()
const instanceConfig = useInstanceConfigStore()
const { t } = useI18n()

const KNOWN_LOCALES = [
  { id: 'en', code: 'en', name: 'English' },
  { id: 'en_US', code: 'en_US', name: 'English (United States)' },
  { id: 'en_GB', code: 'en_GB', name: 'English (United Kingdom)' },
  { id: 'pt', code: 'pt', name: 'Portuguese' },
  { id: 'pt_PT', code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { id: 'pt_BR', code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { id: 'es', code: 'es', name: 'Spanish' },
  { id: 'es_ES', code: 'es_ES', name: 'Spanish (Spain)' },
  { id: 'es_MX', code: 'es_MX', name: 'Spanish (Mexico)' },
  { id: 'fr', code: 'fr', name: 'French' },
  { id: 'fr_FR', code: 'fr_FR', name: 'French (France)' },
  { id: 'de', code: 'de', name: 'German' },
  { id: 'de_DE', code: 'de_DE', name: 'German (Germany)' },
  { id: 'it', code: 'it', name: 'Italian' },
  { id: 'ja', code: 'ja', name: 'Japanese' },
  { id: 'ko', code: 'ko', name: 'Korean' },
  { id: 'zh', code: 'zh', name: 'Chinese' },
  { id: 'zh_CN', code: 'zh_CN', name: 'Chinese (Simplified)' },
  { id: 'zh_TW', code: 'zh_TW', name: 'Chinese (Traditional)' },
  { id: 'ru', code: 'ru', name: 'Russian' },
  { id: 'ar', code: 'ar', name: 'Arabic' },
  { id: 'nl', code: 'nl', name: 'Dutch' },
  { id: 'pl', code: 'pl', name: 'Polish' },
  { id: 'sv', code: 'sv', name: 'Swedish' },
  { id: 'da', code: 'da', name: 'Danish' },
  { id: 'fi', code: 'fi', name: 'Finnish' },
  { id: 'nb', code: 'nb', name: 'Norwegian (Bokmål)' },
  { id: 'tr', code: 'tr', name: 'Turkish' },
  { id: 'cs', code: 'cs', name: 'Czech' },
  { id: 'sk', code: 'sk', name: 'Slovak' },
  { id: 'hu', code: 'hu', name: 'Hungarian' },
  { id: 'ro', code: 'ro', name: 'Romanian' },
  { id: 'uk', code: 'uk', name: 'Ukrainian' },
  { id: 'el', code: 'el', name: 'Greek' },
  { id: 'he', code: 'he', name: 'Hebrew' },
  { id: 'vi', code: 'vi', name: 'Vietnamese' },
  { id: 'th', code: 'th', name: 'Thai' },
  { id: 'id', code: 'id', name: 'Indonesian' },
  { id: 'ms', code: 'ms', name: 'Malay' },
  { id: 'hi', code: 'hi', name: 'Hindi' },
  { id: 'bn', code: 'bn', name: 'Bengali' },
]

const name = ref(auth.user?.name ?? '')
const email = ref(auth.user?.email ?? '')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const preferredLocales = ref<string[]>([])
const notificationOpenMode = ref<'inspector' | 'modal'>('inspector')

const saving = ref(false)
const success = ref('')
const error = ref('')

async function save() {
  error.value = ''
  success.value = ''

  if (newPassword.value && newPassword.value !== confirmPassword.value) {
    error.value = 'New passwords do not match.'
    return
  }
  if (newPassword.value && newPassword.value.length < 8) {
    error.value = 'New password must be at least 8 characters.'
    return
  }

  saving.value = true
  try {
    const body: Record<string, unknown> = {}
    if (name.value !== (auth.user?.name ?? '')) body.name = name.value
    if (email.value !== auth.user?.email) body.email = email.value
    if (newPassword.value) {
      body.currentPassword = currentPassword.value
      body.newPassword = newPassword.value
    }
    const parsedLocales = preferredLocales.value
    body.preferredLocales = parsedLocales
    body.notificationOpenMode = notificationOpenMode.value

    const updated = await apiFetch<{
      id: string
      email: string
      name: string | null
      isGlobalAdmin: boolean
      preferredLocales: string[]
      notificationOpenMode?: string
    }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

    auth.user = {
      ...auth.user!,
      email: updated.email,
      name: updated.name,
      isGlobalAdmin: updated.isGlobalAdmin,
      notificationOpenMode: updated.notificationOpenMode ?? 'inspector',
    }
    name.value = updated.name ?? ''
    email.value = updated.email
    preferredLocales.value = updated.preferredLocales ?? []
    notificationOpenMode.value = (updated.notificationOpenMode as 'inspector' | 'modal') ?? 'inspector'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    success.value = 'Profile updated successfully.'
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to update profile.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const me = await apiFetch<{
      preferredLocales?: string[]
      notificationOpenMode?: string
    }>('/auth/me')
    preferredLocales.value = me.preferredLocales ?? []
    notificationOpenMode.value = (me.notificationOpenMode as 'inspector' | 'modal') ?? 'inspector'
  } catch {
    // non-critical
  }
})

async function deactivateAccount() {
  if (!window.confirm(t('profile.deleteAccountConfirm'))) return
  try {
    await apiFetch('/auth/me/deactivate', { method: 'POST' })
    auth.user = null
    window.location.href = '/login'
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to deactivate account.')
  }
}

// Platform owns the identity fields when this instance signs in through it.
const platformEnabled = computed(() => instanceConfig.auth.platformEnabled)
</script>

<style lang="scss" scoped>
.page-header {
  margin-bottom: 1.25rem;
  h2 {
    margin: 0;
    font-size: 1.4rem;
  }
}

.card {
  padding: 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--nb-c-text-muted);
  }
}

.section-divider {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--nb-c-text-subtle);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 1.25rem 0 0.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--nb-c-border);
}
.section-hint {
  font-size: 0.8rem;
  color: var(--nb-c-text-subtle);
  margin: 0 0 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.9rem;
}

.alert {
  margin-bottom: 0.75rem;
}

.form-actions {
  margin-top: 0.5rem;
}

.info-card {
  dl {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0.5rem 1rem;
    margin: 0;
  }
  dt {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--nb-c-text-subtle);
    align-self: center;
  }
  dd {
    font-size: 0.9rem;
    margin: 0;
  }
}

.danger-card {
  border-color: var(--nb-c-danger-surface-border);
  h3 {
    color: var(--nb-c-status-error);
  }
}
</style>
