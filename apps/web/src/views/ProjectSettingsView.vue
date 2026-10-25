<template>
  <div class="tab-content settings-tab">
    <nav class="settings-sidenav">
      <NbButton
        :variant="section === 'general' ? 'secondary' : 'ghost'"
        :outlined="section === 'general'"
        @click="section = 'general'"
      >
        <NbIcon name="gear-fine" :size="16" /> General
      </NbButton>
      <NbButton
        :variant="section === 'locales' ? 'secondary' : 'ghost'"
        :outlined="section === 'locales'"
        @click="section = 'locales'"
      >
        <NbIcon name="globe-stand" :size="16" /> Locales
      </NbButton>
      <NbButton
        :variant="section === 'namespaces' ? 'secondary' : 'ghost'"
        :outlined="section === 'namespaces'"
        @click="section = 'namespaces'"
      >
        <NbIcon name="folder-open" :size="16" /> Namespaces
      </NbButton>
      <NbButton
        :variant="section === 'members' ? 'secondary' : 'ghost'"
        :outlined="section === 'members'"
        @click="section = 'members'"
      >
        <NbIcon name="users" :size="16" /> Members
      </NbButton>
      <NbButton
        v-if="store.isAdmin"
        :variant="section === 'ai' ? 'secondary' : 'ghost'"
        :outlined="section === 'ai'"
        @click="section = 'ai'"
      >
        <NbIcon name="sparkle" :size="16" /> AI
      </NbButton>
      <div class="snav-spacer" />
      <NbButton v-if="store.isAdmin" variant="danger" @click="section = 'danger'">
        <NbIcon name="trash" :size="16" /> Danger Zone
      </NbButton>
    </nav>

    <div class="settings-pane">
      <!-- ── General ── -->
      <template v-if="section === 'general'">
        <div class="section">
          <h3>{{ t('projects.settings.title') }}</h3>
          <div class="settings-info-row">
            <ProjectLogoUpload
              :model-value="store.project?.avatar"
              :project-name="store.project?.name ?? ''"
              :saving="logoSaving"
              @update:model-value="onLogoChange"
            />
            <div>
              <div class="info-line"><span class="info-label">Name</span> {{ store.project?.name }}</div>
              <div class="info-line">
                <span class="info-label">Slug</span> <code>{{ store.project?.slug }}</code>
              </div>
            </div>
          </div>
          <NbForm v-if="store.isMaintainer" title="Project Name">
            <NbTextInput
              v-model="renameEdit"
              label="Rename Project"
              type="text"
              placeholder="Project name"
              class="rename-input"
              :error="renameError"
            />
            <template #footer>
              <NbButton variant="primary" :loading="renameSaving" :disabled="!renameEdit.trim()" @click="saveRename">
                {{ renameSaving ? 'Saving…' : 'Rename' }}
              </NbButton>
            </template>
          </NbForm>
        </div>
      </template>

      <!-- ── Locales ── -->
      <template v-else-if="section === 'locales'">
        <div class="section">
          <h3>{{ t('projects.locales.title') }}</h3>
          <div v-if="store.locales.length > 0" class="simple-list">
            <div v-for="l in store.locales" :key="l.id" class="simple-row">
              <LocaleBadge :code="l.code" />
              <span class="simple-label">{{ l.name }}</span>
              <span :class="['enabled-badge', l.isEnabled ? 'enabled' : 'disabled']">
                {{ l.isEnabled ? 'enabled' : 'disabled' }}
              </span>
              <NbButton variant="danger" class="icon-btn" title="Remove locale" @click="removeLocale(l)">✕</NbButton>
            </div>
          </div>
          <div v-else class="empty-note">No locales</div>
          <form class="add-locale-form" @submit.prevent="addLocale">
            <div class="locale-quick-add">
              <LocaleSelect
                v-model="selectedKnown"
                :options="KNOWN_LOCALES"
                placeholder="Pick a language…"
                clearable
                clear-label=": or type custom below : "
                @update:model-value="fillFromKnown"
              />
            </div>
            <NbTextInput
              v-model="newLocaleCode"
              placeholder="Code (e.g. en, pt_PT)"
              class="locale-code-input"
              @input="onLocaleCodeInput"
            />
            <NbTextInput v-model="newLocaleName" placeholder="Name (e.g. English)" class="locale-name-input" />
            <NbButton type="submit" :disabled="localeAdding" class="btn-add">
              {{ localeAdding ? t('common.loading') : t('projects.locales.add') }}
            </NbButton>
          </form>
          <p v-if="localeError" class="field-error">{{ localeError }}</p>
        </div>
      </template>

      <!-- ── Namespaces ── -->
      <template v-else-if="section === 'namespaces'">
        <div class="section">
          <h3>{{ t('projects.namespaces.title') }}</h3>
          <div v-if="store.namespaces.length > 0" class="simple-list">
            <div v-for="ns in store.namespaces" :key="ns.id" class="simple-row">
              <span class="ns-tag">{{ ns.slug }}</span>
              <span class="simple-label">{{ ns.name }}</span>
              <NbButton variant="danger" class="icon-btn" title="Remove" @click="removeNamespace(ns)">✕</NbButton>
            </div>
          </div>
          <div v-else class="empty-note">{{ t('projects.namespaces.empty') }}</div>

          <NbForm v-if="store.isMaintainer" @submit.prevent="addNamespace">
            <NbTextInput
              v-model="newNsName"
              label="New namespace"
              type="text"
              :placeholder="t('projects.namespaces.namePlaceholder')"
              class="inline-input"
              :error="nsError"
            />
            <template #footer>
              <NbButton type="submit" variant="primary" :disabled="nsAdding">
                {{ nsAdding ? t('common.loading') : t('common.add') }}
              </NbButton>
            </template>
          </NbForm>
        </div>
      </template>

      <!-- ── Members ── -->
      <template v-else-if="section === 'members'">
        <div class="section">
          <h3>{{ t('projects.members.title') }}</h3>
          <div v-if="store.members.length > 0" class="simple-list">
            <div v-for="m in store.members" :key="m.userId" class="member-row-wrap">
              <div class="simple-row member-row">
                <span class="member-email">{{ m.user?.email ?? m.userId }}</span>
                <NbSelect
                  :model-value="m.role"
                  :options="roleOptions"
                  @update:model-value="updateMemberRole(m.userId, $event as string)"
                />
                <NbButton class="icon-btn" :title="t('projects.members.editLocales')" @click="startEditLocales(m)">
                  🌐
                </NbButton>
                <NbButton variant="danger" class="icon-btn" title="Remove" @click="removeMember(m.userId)">✕</NbButton>
              </div>
              <div v-if="m.assignedLocales && m.assignedLocales.length > 0" class="assigned-locales-summary">
                Locales:
                {{ m.assignedLocales.map((lid) => store.locales.find((l) => l.id === lid)?.code ?? lid).join(', ') }}
              </div>
              <div v-if="editingLocalesForUser === m.userId" class="locale-assignment-editor">
                <LocaleMultiSelect v-model="editingLocaleIds" :options="store.locales" value-field="id" />
                <div class="locale-assignment-hint">{{ t('projects.members.leaveUnchecked') }}</div>
                <div class="locale-assignment-actions">
                  <NbButton class="btn-add" @click="saveLocaleAssignment(m.userId)">{{ t('common.save') }}</NbButton>
                  <NbButton class="btn-cancel" @click="cancelEditLocales">{{ t('common.cancel') }}</NbButton>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-note">{{ t('projects.members.empty') }}</div>
          <form class="add-inline-form" @submit.prevent="addMember">
            <NbTextInput
              v-model="newMemberEmail"
              type="email"
              :placeholder="t('projects.members.emailPlaceholder')"
              class="inline-input"
            />
            <NbSelect v-model="newMemberRole" :options="roleOptions" />
            <NbButton type="submit" :disabled="memberAdding" class="btn-add">
              {{ memberAdding ? t('common.loading') : t('common.add') }}
            </NbButton>
          </form>
          <p v-if="memberError" class="field-error">{{ memberError }}</p>
        </div>
      </template>

      <!-- ── AI ── -->
      <ProjectSettingsAi
        v-else-if="section === 'ai' && store.isAdmin"
        :project-id="projectId"
        :locales="store.locales"
        @changed="onAiChanged"
      />

      <!-- ── Danger Zone ── -->
      <template v-else-if="section === 'danger' && store.isAdmin">
        <div class="section danger-zone">
          <h3>Danger Zone</h3>
          <p class="danger-description">
            Permanently delete this project and all its keys, translations, and history.
            <strong>This cannot be undone.</strong>
          </p>
          <NbButton variant="danger" @click="showDeleteConfirm = true">Delete project…</NbButton>
          <div v-if="showDeleteConfirm" class="delete-confirm-box">
            <p>
              Type the project slug <code>{{ store.project?.slug }}</code> to confirm:
            </p>
            <NbTextInput
              v-model="deleteConfirmSlug"
              type="text"
              :placeholder="store.project?.slug"
              class="delete-confirm-input"
            />
            <p v-if="deleteError" class="field-error">{{ deleteError }}</p>
            <div class="delete-confirm-actions">
              <NbButton
                variant="danger"
                :disabled="deleting || deleteConfirmSlug !== store.project?.slug"
                @click="confirmDelete"
              >
                {{ deleting ? 'Deleting…' : 'Permanently delete' }}
              </NbButton>
              <NbButton
                variant="secondary"
                @click="
                  () => {
                    showDeleteConfirm = false
                    deleteConfirmSlug = ''
                    deleteError = ''
                  }
                "
              >
                Cancel
              </NbButton>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore, type Locale, type Namespace, type Member } from '../stores/project'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'
import { type ISelectOption } from '@nubisco/ui'
import LocaleBadge from '../components/LocaleBadge.vue'
import LocaleSelect from '../components/LocaleSelect.vue'
import LocaleMultiSelect from '../components/LocaleMultiSelect.vue'
import ProjectLogoUpload from '../components/ProjectLogoUpload.vue'
import ProjectSettingsAi from '../components/settings/ProjectSettingsAi.vue'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const store = useProjectStore()
const { t } = useI18n()

type SettingsSection = 'general' | 'locales' | 'namespaces' | 'members' | 'ai' | 'danger'
const SECTIONS: SettingsSection[] = ['general', 'locales', 'namespaces', 'members', 'ai', 'danger']
// ?section=ai opens a section directly, so a link can land on the AI settings.
const requested = String(route.query.section ?? '') as SettingsSection
const section = ref<SettingsSection>(SECTIONS.includes(requested) ? requested : 'general')

// ── General ────────────────────────────────────────────────────────
const logoSaving = ref(false)
const renameEdit = ref('')
const renameSaving = ref(false)
const renameError = ref('')

async function onLogoChange(dataUrl: string) {
  logoSaving.value = true
  try {
    const updated = await apiFetch<{ avatar?: string | null }>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar: dataUrl }),
    })
    if (store.project) store.project.avatar = updated.avatar ?? null
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to save logo')
  } finally {
    logoSaving.value = false
  }
}

onMounted(() => {
  renameEdit.value = store.project?.name ?? ''
})

async function saveRename() {
  renameError.value = ''
  renameSaving.value = true
  try {
    const updated = await apiFetch<{ name: string }>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: renameEdit.value }),
    })
    if (store.project) store.project.name = updated.name
  } catch (e) {
    renameError.value = e instanceof Error ? e.message : 'Failed to rename project'
  } finally {
    renameSaving.value = false
  }
}

// ── Locales ────────────────────────────────────────────────────────
const newLocaleCode = ref('')
const newLocaleName = ref('')
const localeError = ref('')
const localeAdding = ref(false)
const selectedKnown = ref('')

const COMMON_LOCALES: Record<string, string> = {
  en: 'English',
  'pt-PT': 'Portuguese (Portugal)',
  'pt-BR': 'Portuguese (Brazil)',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  tr: 'Turkish',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
}

const KNOWN_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'en_US', name: 'English (United States)' },
  { code: 'en_GB', name: 'English (United Kingdom)' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'zh_CN', name: 'Chinese (Simplified)' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'tr', name: 'Turkish' },
]

function fillFromKnown(code: string) {
  if (!code) return
  const found = KNOWN_LOCALES.find((l) => l.code === code)
  if (found) {
    newLocaleCode.value = found.code
    newLocaleName.value = found.name
    selectedKnown.value = ''
  }
}

function onLocaleCodeInput() {
  if (COMMON_LOCALES[newLocaleCode.value] && !newLocaleName.value)
    newLocaleName.value = COMMON_LOCALES[newLocaleCode.value]
}

async function addLocale() {
  localeError.value = ''
  if (!newLocaleCode.value.trim()) {
    localeError.value = 'Code is required'
    return
  }
  if (!newLocaleName.value.trim()) {
    localeError.value = 'Name is required'
    return
  }
  localeAdding.value = true
  try {
    const locale = await apiFetch<Locale>(`/projects/${projectId}/locales`, {
      method: 'POST',
      body: JSON.stringify({ code: newLocaleCode.value.trim(), name: newLocaleName.value.trim() }),
    })
    store.locales.push(locale)
    store.localeProgress.push({
      id: locale.id,
      code: locale.code,
      name: locale.name,
      approved: 0,
      total: store.totalKeys,
    })
    newLocaleCode.value = ''
    newLocaleName.value = ''
  } catch (e) {
    localeError.value = e instanceof Error ? e.message : 'Failed to add locale'
  } finally {
    localeAdding.value = false
  }
}

async function removeLocale(locale: Locale) {
  if (!confirm(t('projects.locales.confirmRemove', { code: locale.code }))) return
  try {
    await apiFetch(`/projects/${projectId}/locales/${locale.id}`, { method: 'DELETE' })
    store.locales = store.locales.filter((l) => l.id !== locale.id)
    store.localeProgress = store.localeProgress.filter((l) => l.id !== locale.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not remove locale')
  }
}

// ── Namespaces ────────────────────────────────────────────────────
const newNsName = ref('')
const nsError = ref('')
const nsAdding = ref(false)

function toSlug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function addNamespace() {
  nsError.value = ''
  if (!newNsName.value.trim()) {
    nsError.value = 'Name is required'
    return
  }
  nsAdding.value = true
  try {
    const slug = toSlug(newNsName.value.trim())
    const ns = await apiFetch<Namespace>(`/projects/${projectId}/namespaces`, {
      method: 'POST',
      body: JSON.stringify({ name: newNsName.value.trim(), slug }),
    })
    store.namespaces.push(ns)
    newNsName.value = ''
  } catch (e) {
    nsError.value = e instanceof Error ? e.message : 'Failed to add namespace'
  } finally {
    nsAdding.value = false
  }
}

async function removeNamespace(ns: Namespace) {
  if (!confirm(t('projects.namespaces.confirmRemove', { slug: ns.slug }))) return
  try {
    await apiFetch(`/projects/${projectId}/namespaces/${ns.id}`, { method: 'DELETE' })
    store.namespaces = store.namespaces.filter((n) => n.id !== ns.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not remove namespace')
  }
}

// ── Members ────────────────────────────────────────────────────────
const newMemberEmail = ref('')
const newMemberRole = ref('TRANSLATOR')
const memberError = ref('')
const memberAdding = ref(false)
const editingLocalesForUser = ref<string | null>(null)
const editingLocaleIds = ref<string[]>([])

const roleOptions = computed<ISelectOption[]>(() => [
  { label: t('common.roles.READER'), value: 'READER' },
  { label: t('common.roles.TRANSLATOR'), value: 'TRANSLATOR' },
  { label: t('common.roles.MAINTAINER'), value: 'MAINTAINER' },
  { label: t('common.roles.ADMIN'), value: 'ADMIN' },
])

async function addMember() {
  memberError.value = ''
  if (!newMemberEmail.value.trim()) {
    memberError.value = 'Email is required'
    return
  }
  memberAdding.value = true
  try {
    // The server resolves the address, so nothing here searches other accounts.
    await apiFetch(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: newMemberEmail.value.trim(), role: newMemberRole.value }),
    })
    await store.reloadMembers()
    newMemberEmail.value = ''
  } catch (e) {
    memberError.value = e instanceof Error ? e.message : 'Failed to add member'
  } finally {
    memberAdding.value = false
  }
}

async function removeMember(userId: string) {
  if (!confirm(t('projects.members.confirmRemove'))) return
  try {
    await apiFetch(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
    store.members = store.members.filter((m) => m.userId !== userId)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not remove member')
  }
}

async function updateMemberRole(userId: string, role: string) {
  try {
    await apiFetch(`/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
    const m = store.members.find((x) => x.userId === userId)
    if (m) m.role = role
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not update role')
  }
}

function startEditLocales(m: Member) {
  editingLocalesForUser.value = m.userId
  editingLocaleIds.value = [...(m.assignedLocales ?? [])]
}

function cancelEditLocales() {
  editingLocalesForUser.value = null
  editingLocaleIds.value = []
}

async function saveLocaleAssignment(userId: string) {
  try {
    await apiFetch(`/projects/${projectId}/members/${userId}/locales`, {
      method: 'PUT',
      body: JSON.stringify({ localeIds: editingLocaleIds.value }),
    })
    const m = store.members.find((x) => x.userId === userId)
    if (m) m.assignedLocales = [...editingLocaleIds.value]
    cancelEditLocales()
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to save locale assignments')
  }
}

// ── AI ────────────────────────────────────────────────────────────
// Read and saved by ProjectSettingsAi through /projects/:id/ai/settings. The
// project store only keeps what the editor needs to show the suggest button.
function onAiChanged(settings: { enabled: boolean; hasKey: boolean }) {
  if (!store.project) return
  store.project.aiEnabled = settings.enabled
  store.project.aiHasKey = settings.hasKey
}

// ── Delete ────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deleteConfirmSlug = ref('')
const deleteError = ref('')
const deleting = ref(false)

async function confirmDelete() {
  if (deleteConfirmSlug.value !== store.project?.slug) {
    deleteError.value = 'Slug does not match'
    return
  }
  deleting.value = true
  deleteError.value = ''
  try {
    await apiFetch(`/projects/${projectId}`, { method: 'DELETE' })
    router.replace('/dashboard')
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Delete failed'
    deleting.value = false
  }
}
</script>

<style lang="scss" scoped>
.tab-content {
  animation: fadeIn 0.15s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.settings-tab {
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 0 !important;
  min-height: 480px;
}

.settings-sidenav {
  width: 172px;
  flex-shrink: 0;
  border-right: 1px solid var(--nb-c-border);
  padding: 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-self: stretch;
}

.snav-spacer {
  flex: 1;
}

.settings-pane {
  flex: 1;
  min-width: 0;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

// On a phone the section list becomes one scrolling row above the pane, so
// the pane gets the whole width. Gated, so the desktop does not move.
@include variables.phone {
  .settings-tab {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-sidenav {
    width: auto;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--nb-c-border);
    padding: 0.5rem 0;
    gap: 0.25rem;

    > * {
      flex-shrink: 0;
    }
  }

  .snav-spacer {
    display: none;
  }

  .settings-pane {
    padding: 1rem 0;
  }
}

.section {
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-border);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--nb-c-text-muted);
  }
}

.settings-info-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.project-avatar-xl {
  font-size: 3rem;
  line-height: 1;
}
.info-line {
  font-size: 0.88rem;
  margin-bottom: 0.25rem;
}
.info-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--nb-c-text-subtle);
  text-transform: uppercase;
  margin-right: 0.5rem;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  label {
    font-size: 0.85rem;
    color: var(--nb-c-text-muted);
    font-weight: 600;
  }
}
.avatar-input {
  width: 80px;
  text-align: center;
}
.rename-input {
  flex: 1;
  max-width: 280px;
}

.simple-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.simple-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--nb-c-border);
  &:last-child {
    border-bottom: none;
  }
}
.simple-label {
  font-size: 0.85rem;
  color: var(--nb-c-text-subtle);
  flex: 1;
}
.member-email {
  font-size: 0.875rem;
  flex: 1;
}
.member-row-wrap {
  border-bottom: 1px solid var(--nb-c-border);
  padding: 0.3rem 0;
  &:last-child {
    border-bottom: none;
  }
}
.assigned-locales-summary {
  font-size: 0.75rem;
  color: var(--nb-c-text-subtle);
  margin: 0.1rem 0 0.3rem;
}
.locale-assignment-editor {
  margin: 0.5rem 0 0.75rem;
  padding: 0.75rem;
  background: var(--nb-c-layer-2);
  border: 1px solid var(--nb-c-border);
  border-radius: 6px;
}
.locale-assignment-hint {
  font-size: 0.75rem;
  color: var(--nb-c-text-subtle);
  margin-bottom: 0.5rem;
}
.locale-assignment-actions {
  display: flex;
  gap: 0.5rem;
}

.ns-tag {
  font-size: 0.78rem;
  background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
  color: var(--nb-c-primary);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.enabled-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  &.enabled {
    background: var(--nb-c-success-surface);
    color: var(--nb-c-on-success-surface);
  }
  &.disabled {
    background: var(--nb-c-neutral-surface);
    color: var(--nb-c-on-neutral-surface);
  }
}

.add-locale-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
  align-items: center;
  .locale-quick-add {
    width: 100%;
    margin-bottom: 0.25rem;
  }
  .locale-code-input {
    width: 150px;
  }
  .locale-name-input {
    flex: 1;
    min-width: 160px;
  }
}

.add-inline-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  .inline-input {
    flex: 1;
    min-width: 160px;
  }
}

.icon-btn {
  background: none;
  border: 1px solid var(--nb-c-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
  line-height: 1;
  &:hover {
    background: var(--nb-c-surface-hover);
  }
}

.btn-add {
  padding: 0.45rem 0.9rem;
  background: var(--nb-c-secondary);
  color: var(--nb-c-secondary-a11y);
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: var(--nb-c-secondary-hover);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-cancel {
  padding: 0.45rem 0.9rem;
  background: var(--nb-c-layer-1);
  color: var(--nb-c-text-muted);
  border: 1px solid var(--nb-c-border);
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  &:hover {
    background: var(--nb-c-surface-hover);
  }
}

.field-error {
  color: var(--nb-c-status-error);
  font-size: 0.82rem;
  margin: 0.35rem 0 0;
}
.empty-note {
  color: var(--nb-c-text-subtle);
  font-size: 0.9rem;
}

.danger-zone {
  border: 1px solid var(--nb-c-danger-surface-border);
  border-radius: 8px;
  background: var(--nb-c-danger-surface);
  h3 {
    color: var(--nb-c-status-error);
  }
}
.danger-description {
  font-size: 0.88rem;
  color: var(--nb-c-text-subtle);
  margin: 0 0 0.85rem;
  line-height: 1.5;
}

.delete-confirm-box {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-danger-surface-border);
  border-radius: 6px;
  p {
    margin: 0 0 0.6rem;
    font-size: 0.875rem;
    color: var(--nb-c-text-muted);
  }
}
.delete-confirm-input {
  width: 100%;
  max-width: 320px;
  margin-bottom: 0.75rem;
}
.delete-confirm-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
