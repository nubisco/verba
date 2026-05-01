<template>
  <div>
    <div class="card">
      <h3>{{ t('profile.accountDetails') }}</h3>

      <div class="field">
        <label>{{ t('profile.name') }}</label>
        <NbTextInput v-model="name" type="text" :placeholder="t('profile.namePlaceholder')" />
      </div>

      <div class="field">
        <label>{{ t('profile.email') }}</label>
        <NbTextInput v-model="email" type="email" :placeholder="t('profile.emailPlaceholder')" />
      </div>

      <div class="field">
        <label>{{ t('profile.preferredLocales') }}</label>
        <LocaleMultiSelect v-model="preferredLocales" :options="KNOWN_LOCALES" value-field="code" />
      </div>

      <div class="field">
        <label>Open notifications with</label>
        <div class="open-mode-toggle">
          <NbButton
            :class="['mode-btn', { active: notificationOpenMode === 'inspector' }]"
            @click="notificationOpenMode = 'inspector'"
          >
            Inspector
          </NbButton>
          <NbButton
            :class="['mode-btn', { active: notificationOpenMode === 'modal' }]"
            @click="notificationOpenMode = 'modal'"
          >
            Modal
          </NbButton>
        </div>
      </div>

      <div class="section-divider">{{ t('profile.changePassword') }}</div>
      <p class="section-hint">{{ t('profile.changePasswordHint') }}</p>

      <div class="field">
        <label>{{ t('profile.currentPassword') }}</label>
        <NbTextInput v-model="currentPassword" type="password" autocomplete="current-password" />
      </div>
      <div class="field">
        <label>{{ t('profile.newPassword') }}</label>
        <NbTextInput v-model="newPassword" type="password" autocomplete="new-password" />
      </div>
      <div class="field">
        <label>{{ t('profile.confirmPassword') }}</label>
        <NbTextInput v-model="confirmPassword" type="password" autocomplete="new-password" />
      </div>

      <div v-if="error" class="alert alert-error">{{ error }}</div>
      <div v-if="success" class="alert alert-success">{{ success }}</div>

      <div class="form-actions">
        <NbButton variant="primary" :disabled="saving" @click="save">
          {{ saving ? t('profile.savingProfile') : t('profile.saveProfile') }}
        </NbButton>
      </div>
    </div>

    <div class="card info-card">
      <h3>{{ t('profile.accountInfo') }}</h3>
      <dl>
        <dt>{{ t('profile.role') }}</dt>
        <dd>
          {{ auth.user?.isGlobalAdmin ? t('profile.globalAdmin') : t('profile.user') }}
        </dd>
      </dl>
    </div>

    <div class="card danger-card">
      <h3>{{ t('profile.dangerZone') }}</h3>
      <p class="section-hint">{{ t('profile.dangerHint') }}</p>
      <NbButton variant="danger" @click="deactivateAccount">
        {{ t('profile.deactivate') }}
      </NbButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { apiFetch } from '../api'
import LocaleMultiSelect from '../components/LocaleMultiSelect.vue'
import { useI18n } from 'vue-i18n'

const auth = useAuthStore()
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
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1.25rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
  }
}

.section-divider {
  font-size: 0.8rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 1.25rem 0 0.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid #f0f0f0;
}
.section-hint {
  font-size: 0.8rem;
  color: #aaa;
  margin: 0 0 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.9rem;
  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #555;
  }
}

.alert {
  padding: 0.6rem 0.9rem;
  border-radius: 5px;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  &.alert-error {
    background: #fdecea;
    color: #c0392b;
    border: 1px solid #f5c6c6;
  }
  &.alert-success {
    background: #e8f8f0;
    color: #1a7a42;
    border: 1px solid #b3e6cc;
  }
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
    color: #888;
    align-self: center;
  }
  dd {
    font-size: 0.9rem;
    margin: 0;
  }
}

.danger-card {
  border-color: #f5c6c6;
  h3 {
    color: #c0392b;
  }
}

.open-mode-toggle {
  display: flex;
  gap: 0;
  border: 1px solid #d0d0d0;
  border-radius: 5px;
  overflow: hidden;
  width: fit-content;
}

.mode-btn {
  padding: 0.4rem 1rem;
  border: none;
  background: #f5f5f5;
  color: #555;
  cursor: pointer;
  font-size: 0.85rem;
  &:not(:last-child) {
    border-right: 1px solid #d0d0d0;
  }
  &.active {
    background: #1a1a2e;
    color: #fff;
  }
  &:hover:not(.active) {
    background: #e8e8e8;
  }
}
</style>
