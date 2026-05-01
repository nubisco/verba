<template>
  <Teleport defer to="#verba-topbar">
    <NbGrid align="center" justify="between" class="page-topbar" grow>
      <NbBreadcrumbs title="Nubisco" subtitle="Verba">{{ project?.name ?? '…' }}</NbBreadcrumbs>
    </NbGrid>
  </Teleport>

  <div>
    <div v-if="loading" class="skeleton-header" />
    <template v-else-if="project">
      <!-- Page header -->
      <div class="page-header">
        <div class="header-main">
          <ProjectAvatar :avatar="project.avatar" :name="project.name" size="lg" />
          <div>
            <h2>{{ project.name }}</h2>
            <span class="slug">{{ project.slug }}</span>
          </div>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="tab-bar">
        <NbButton :class="['tab-btn', { active: activeTab === 'overview' }]" @click="onTabChange('overview')">
          Overview
        </NbButton>
        <NbButton :class="['tab-btn', { active: activeTab === 'settings' }]" @click="onTabChange('settings')">
          Settings
        </NbButton>
        <NbButton :class="['tab-btn', { active: activeTab === 'import' }]" @click="onTabChange('import')"
          >Import</NbButton
        >
        <NbButton :class="['tab-btn', { active: activeTab === 'export' }]" @click="onTabChange('export')"
          >Export</NbButton
        >
        <NbButton :class="['tab-btn', { active: activeTab === 'history' }]" @click="onTabChange('history')">
          History
        </NbButton>
      </div>

      <!-- ── Tab: Overview ─────────────────────────────────────────── -->
      <div v-if="activeTab === 'overview'" class="tab-content">
        <div class="stats-row">
          <RouterLink :to="`/projects/${projectId}/keys`" class="stat-card clickable">
            <div class="stat-value">{{ totalKeys }}</div>
            <div class="stat-label">{{ t('projects.header.totalKeys') }}</div>
          </RouterLink>
          <RouterLink :to="`/projects/${projectId}/review`" class="stat-card warning clickable">
            <div class="stat-value">{{ needsReview }}</div>
            <div class="stat-label">{{ t('projects.header.needsReview') }}</div>
          </RouterLink>
        </div>

        <!-- Namespaces with key counts -->
        <div class="section">
          <h3>{{ t('projects.namespaces.title') }}</h3>
          <div v-if="namespaces.length === 0" class="empty-note">
            {{ t('projects.namespaces.empty') }}
          </div>
          <div v-else class="ns-count-list">
            <div v-for="ns in namespaces" :key="ns.id" class="ns-count-row">
              <span class="ns-tag">{{ ns.slug }}</span>
              <span class="ns-name">{{ ns.name }}</span>
              <span class="ns-count-badge">{{ (ns as any)._count?.keys ?? 0 }} keys</span>
            </div>
          </div>
        </div>

        <!-- Review queue (my tasks for this project) -->
        <div class="section">
          <h3>My Tasks</h3>
          <div v-if="tasks.length === 0" class="empty-note">No active tasks</div>
          <div v-else class="task-list">
            <RouterLink
              v-for="task in tasks"
              :key="task.id"
              :to="`/projects/${projectId}/keys/${task.key.id}`"
              class="task-card"
            >
              <code class="task-key">{{ task.key.name }}</code>
              <div class="task-meta">
                <LocaleBadge :code="task.locale.code" />
                <span class="status-dot" :style="{ background: STATUS_COLORS[task.status] || '#888' }" />
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Locale progress -->
        <div class="section">
          <h3>{{ t('projects.locales.title') }}</h3>
          <div v-if="localeProgress.length > 0" class="locale-list">
            <div v-for="lp in localeProgress" :key="lp.code" class="locale-row">
              <LocaleBadge :code="lp.code" />
              <span class="locale-name">{{ lp.name }}</span>
              <div class="progress-bar-wrap">
                <div
                  class="progress-bar-fill"
                  :style="{
                    width: lp.total ? `${(lp.approved / lp.total) * 100}%` : '0%',
                  }"
                />
              </div>
              <span class="progress-label">{{ lp.approved }} / {{ lp.total }}</span>
              <NbButton class="icon-btn" title="Export JSON" @click="exportLocale(lp.code)">⬇</NbButton>
            </div>
          </div>
          <div v-else class="empty-note">No locales yet</div>
        </div>
      </div>

      <!-- ── Tab: Settings ─────────────────────────────────────────── -->
      <div v-if="activeTab === 'settings'" class="tab-content settings-tab">
        <!-- Settings sidenav -->
        <nav class="settings-sidenav">
          <NbButton
            :class="['settings-nav-item', { active: settingsSection === 'general' }]"
            @click="settingsSection = 'general'"
          >
            <NbIcon name="gear-fine" :size="16" /> General
          </NbButton>
          <NbButton
            :class="['settings-nav-item', { active: settingsSection === 'locales' }]"
            @click="settingsSection = 'locales'"
          >
            <NbIcon name="globe-stand" :size="16" /> Locales
          </NbButton>
          <NbButton
            :class="['settings-nav-item', { active: settingsSection === 'namespaces' }]"
            @click="settingsSection = 'namespaces'"
          >
            <NbIcon name="folder-open" :size="16" /> Namespaces
          </NbButton>
          <NbButton
            :class="['settings-nav-item', { active: settingsSection === 'members' }]"
            @click="settingsSection = 'members'"
          >
            <NbIcon name="users" :size="16" /> Members
          </NbButton>
          <NbButton
            v-if="isMaintainer"
            :class="['settings-nav-item', { active: settingsSection === 'ai' }]"
            @click="settingsSection = 'ai'"
          >
            <NbIcon name="sparkle" :size="16" /> AI
          </NbButton>
          <div class="snav-spacer" />
          <NbButton
            v-if="isAdmin"
            variant="danger"
            :class="['settings-nav-item', { active: settingsSection === 'danger' }]"
            @click="settingsSection = 'danger'"
          >
            <NbIcon name="trash" :size="16" /> Danger Zone
          </NbButton>
        </nav>

        <!-- Settings pane -->
        <div class="settings-pane">
          <!-- ── General ────────────────────────────────────────────── -->
          <template v-if="settingsSection === 'general'">
            <div class="section">
              <h3>{{ t('projects.settings.title') }}</h3>
              <div class="settings-info-row">
                <ProjectLogoUpload
                  :model-value="project.avatar"
                  :project-name="project.name"
                  :saving="logoSaving"
                  @update:model-value="onLogoChange"
                />
                <div>
                  <div class="info-line"><span class="info-label">Name</span> {{ project.name }}</div>
                  <div class="info-line">
                    <span class="info-label">Slug</span>
                    <code>{{ project.slug }}</code>
                  </div>
                </div>
              </div>
              <div v-if="isMaintainer" class="settings-row" style="margin-top: 0.75rem">
                <label>Rename project</label>
                <NbTextInput v-model="renameEdit" type="text" placeholder="Project name" class="rename-input" />
                <NbButton class="btn-add" :disabled="renameSaving || !renameEdit.trim()" @click="saveRename">
                  {{ renameSaving ? 'Saving…' : 'Rename' }}
                </NbButton>
                <p v-if="renameError" class="field-error">{{ renameError }}</p>
              </div>
            </div>
          </template>

          <!-- ── Locales ────────────────────────────────────────────── -->
          <template v-else-if="settingsSection === 'locales'">
            <div class="section">
              <h3>{{ t('projects.locales.title') }}</h3>
              <div v-if="locales.length > 0" class="simple-list">
                <div v-for="l in locales" :key="l.id" class="simple-row">
                  <LocaleBadge :code="l.code" />
                  <span class="simple-label">{{ l.name }}</span>
                  <span :class="['enabled-badge', l.isEnabled ? 'enabled' : 'disabled']">{{
                    l.isEnabled ? 'enabled' : 'disabled'
                  }}</span>
                  <NbButton variant="danger" class="icon-btn" title="Remove locale" @click="removeLocale(l)"
                    >✕</NbButton
                  >
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

          <!-- ── Namespaces ─────────────────────────────────────────── -->
          <template v-else-if="settingsSection === 'namespaces'">
            <div class="section">
              <h3>{{ t('projects.namespaces.title') }}</h3>
              <div v-if="namespaces.length > 0" class="simple-list">
                <div v-for="ns in namespaces" :key="ns.id" class="simple-row">
                  <span class="ns-tag">{{ ns.slug }}</span>
                  <span class="simple-label">{{ ns.name }}</span>
                  <NbButton variant="danger" class="icon-btn" title="Remove" @click="removeNamespace(ns)">✕</NbButton>
                </div>
              </div>
              <div v-else class="empty-note">
                {{ t('projects.namespaces.empty') }}
              </div>
              <form class="add-inline-form" @submit.prevent="addNamespace">
                <NbTextInput
                  v-model="newNsName"
                  :placeholder="t('projects.namespaces.namePlaceholder')"
                  class="inline-input"
                />
                <NbButton type="submit" :disabled="nsAdding" class="btn-add">
                  {{ nsAdding ? t('common.loading') : t('common.add') }}
                </NbButton>
              </form>
              <p v-if="nsError" class="field-error">{{ nsError }}</p>
            </div>
          </template>

          <!-- ── Members ────────────────────────────────────────────── -->
          <template v-else-if="settingsSection === 'members'">
            <div class="section">
              <h3>{{ t('projects.members.title') }}</h3>
              <div v-if="members.length > 0" class="simple-list">
                <div v-for="m in members" :key="m.userId" class="member-row-wrap">
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
                    <NbButton variant="danger" class="icon-btn" title="Remove" @click="removeMember(m.userId)"
                      >✕</NbButton
                    >
                  </div>
                  <div v-if="m.assignedLocales && m.assignedLocales.length > 0" class="assigned-locales-summary">
                    Locales:
                    {{ m.assignedLocales.map((lid) => locales.find((l) => l.id === lid)?.code ?? lid).join(', ') }}
                  </div>
                  <div v-if="editingLocalesForUser === m.userId" class="locale-assignment-editor">
                    <LocaleMultiSelect v-model="editingLocaleIds" :options="locales" value-field="id" />
                    <div class="locale-assignment-hint">
                      {{ t('projects.members.leaveUnchecked') }}
                    </div>
                    <div class="locale-assignment-actions">
                      <NbButton class="btn-add" @click="saveLocaleAssignment(m.userId)">
                        {{ t('common.save') }}
                      </NbButton>
                      <NbButton class="btn-cancel" @click="cancelEditLocales">
                        {{ t('common.cancel') }}
                      </NbButton>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-note">
                {{ t('projects.members.empty') }}
              </div>
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

          <!-- ── AI ─────────────────────────────────────────────────── -->
          <template v-else-if="settingsSection === 'ai' && isMaintainer">
            <div class="section">
              <h3>AI Translation Settings</h3>
              <div class="ai-settings">
                <label class="ai-toggle">
                  <input v-model="aiEnabled" type="checkbox" />
                  Enable AI suggestions
                </label>
                <div class="field-row">
                  <label>Provider</label>
                  <NbSelect v-model="aiProvider" :options="aiProviderOptions" />
                </div>
                <p v-if="aiProvider === 'openai'" class="ai-provider-note">
                  Get an API key at
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener"
                    >platform.openai.com/api-keys</a
                  >. Requires a paid account with billing enabled. Recommended model: <code>gpt-4o-mini</code> (low
                  cost, fast).
                </p>
                <p v-else-if="aiProvider === 'anthropic'" class="ai-provider-note">
                  Get an API key at
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener"
                    >console.anthropic.com/settings/keys</a
                  >. Requires billing. Recommended model: <code>claude-3-haiku-20240307</code>.
                </p>
                <p v-else-if="aiProvider === 'gemini'" class="ai-provider-note">
                  Get a <strong>free</strong> API key at
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener"
                    >aistudio.google.com/app/apikey</a
                  >. Free tier: 15 req/min, 1 500 req/day. Recommended model: <code>gemini-2.0-flash-lite</code> (leave
                  Model field blank to use it).
                </p>
                <div class="field-row">
                  <label>Model</label>
                  <NbTextInput
                    v-model="aiModel"
                    placeholder="e.g. gpt-4o-mini, claude-3-haiku-20240307"
                    class="ai-input"
                  />
                </div>
                <div class="field-row">
                  <label>API Key</label>
                  <NbTextInput
                    :model-value="aiApiKey"
                    type="password"
                    :placeholder="
                      project?.aiApiKey === '***'
                        ? '●●●●● (key already set: leave blank to keep)'
                        : 'Paste key: stored encrypted'
                    "
                    class="ai-input"
                    autocomplete="off"
                    @update:model-value="
                      (v) => {
                        aiApiKey = v
                        aiApiKeyChanged = true
                      }
                    "
                  />
                </div>
                <div class="ai-actions">
                  <NbButton class="btn-add" :disabled="aiSaving" @click="saveAiSettings">
                    {{ aiSaving ? 'Saving…' : 'Save AI Settings' }}
                  </NbButton>
                  <span v-if="aiSaveMsg" class="save-msg">{{ aiSaveMsg }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- ── Danger Zone ─────────────────────────────────────────── -->
          <template v-else-if="settingsSection === 'danger' && isAdmin">
            <div class="section danger-zone">
              <h3>Danger Zone</h3>
              <p class="danger-description">
                Permanently delete this project and all its keys, translations, and history.
                <strong>This cannot be undone.</strong>
              </p>
              <NbButton variant="danger" @click="showDeleteConfirm = true">Delete project…</NbButton>
              <div v-if="showDeleteConfirm" class="delete-confirm-box">
                <p>
                  Type the project slug <code>{{ project.slug }}</code> to confirm:
                </p>
                <NbTextInput
                  v-model="deleteConfirmSlug"
                  type="text"
                  :placeholder="project.slug"
                  class="delete-confirm-input"
                />
                <p v-if="deleteError" class="field-error">{{ deleteError }}</p>
                <div class="delete-confirm-actions">
                  <NbButton
                    variant="danger"
                    :disabled="deleting || deleteConfirmSlug !== project.slug"
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

      <!-- ── Tab: Import ─────────────────────────────────────────── -->
      <div v-if="activeTab === 'import'" class="tab-content">
        <ProjectImportPanel :project-id="projectId" />
      </div>

      <!-- ── Tab: Export ─────────────────────────────────────────── -->
      <div v-if="activeTab === 'export'" class="tab-content">
        <ProjectExportPanel :project-id="projectId" />
      </div>

      <!-- ── Tab: History ─────────────────────────────────────────── -->
      <div v-if="activeTab === 'history'" class="tab-content">
        <div class="section history-section">
          <h3>Project History</h3>
          <div v-if="historyLoading && historyEntries.length === 0" class="empty-note">Loading…</div>
          <div v-else-if="historyEntries.length === 0" class="empty-note">No history yet</div>
          <div v-else class="history-table-wrap">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in historyEntries" :key="entry.id">
                  <td>
                    <code class="action-code">{{ entry.action }}</code>
                  </td>
                  <td>
                    <span class="entity-type">{{ entry.entityType }}</span>
                  </td>
                  <td>
                    {{ entry.user ? entry.user.name?.trim() || entry.user.email : 'System' }}
                  </td>
                  <td class="time-cell">{{ formatTime(entry.createdAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="historyHasMore" class="load-more">
            <NbButton outlined :disabled="historyLoading" @click="loadMoreHistory">
              {{ historyLoading ? 'Loading…' : `Load more (${historyTotal - historyEntries.length} remaining)` }}
            </NbButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '../api'
import { useAuthStore } from '../stores/auth'
import LocaleSelect from '../components/LocaleSelect.vue'
import LocaleMultiSelect from '../components/LocaleMultiSelect.vue'
import ProjectImportPanel from '../components/ProjectImportPanel.vue'
import ProjectExportPanel from '../components/ProjectExportPanel.vue'
import ProjectAvatar from '../components/ProjectAvatar.vue'
import ProjectLogoUpload from '../components/ProjectLogoUpload.vue'
import { useI18n } from 'vue-i18n'
import { type NbSelectOption } from '@nubisco/ui'
import LocaleBadge from '../components/LocaleBadge.vue'

const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
const { t } = useI18n()

type TabId = 'overview' | 'settings' | 'import' | 'export' | 'history'
const VALID_TABS: TabId[] = ['overview', 'settings', 'import', 'export', 'history']
const activeTab = computed<TabId>(() => {
  const hash = route.hash.slice(1) as TabId
  return VALID_TABS.includes(hash) ? hash : 'overview'
})

type SettingsSection = 'general' | 'locales' | 'namespaces' | 'members' | 'ai' | 'danger'
const settingsSection = ref<SettingsSection>('general')

function exportLocale(localeCode: string) {
  const url = `${apiBase}/projects/${projectId}/export/${localeCode}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = `${localeCode}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

interface Project {
  id: string
  name: string
  slug: string
  avatar?: string | null
  aiEnabled?: boolean
  aiProvider?: string | null
  aiApiKey?: string | null
  aiModel?: string | null
}
interface Locale {
  id: string
  code: string
  name: string
  isEnabled: boolean
}
interface Translation {
  id: string
  localeId: string
  status: string
}
interface LocaleProgress {
  id: string
  code: string
  name: string
  approved: number
  total: number
}
interface Namespace {
  id: string
  name: string
  slug: string
  _count?: { keys: number }
}
interface Member {
  userId: string
  role: string
  assignedLocales?: string[]
  user: { email: string }
}
interface Task {
  id: string
  status: string
  key: { id: string; name: string; project: { id: string; name: string } }
  locale: { code: string }
}
interface HistoryEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  user: { id: string; email: string; name?: string | null } | null
}

const project = ref<Project | null>(null)
const loading = ref(true)
const totalKeys = ref(0)
const needsReview = ref(0)
const localeProgress = ref<LocaleProgress[]>([])
const locales = ref<Locale[]>([])
const namespaces = ref<Namespace[]>([])
const members = ref<Member[]>([])
const tasks = ref<Task[]>([])

const auth = useAuthStore()
const isMaintainer = computed(() => {
  const m = members.value.find((m) => m.userId === auth.user?.id)
  return m ? ['MAINTAINER', 'ADMIN'].includes(m.role) : (auth.user?.isGlobalAdmin ?? false)
})

const isAdmin = computed(() => {
  const m = members.value.find((m) => m.userId === auth.user?.id)
  return m ? m.role === 'ADMIN' : (auth.user?.isGlobalAdmin ?? false)
})

// ── History ────────────────────────────────────────────────────────
const historyEntries = ref<HistoryEntry[]>([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyLimit = 50
const historyLoading = ref(false)
const historyLoaded = ref(false)

async function loadHistory(reset = false) {
  if (reset) {
    historyPage.value = 1
    historyEntries.value = []
    historyLoaded.value = false
  }
  historyLoading.value = true
  try {
    const res = await apiFetch<{ items: HistoryEntry[]; total: number }>(
      `/projects/${projectId}/history?page=${historyPage.value}&limit=${historyLimit}`,
    )
    if (reset) historyEntries.value = res.items
    else historyEntries.value.push(...res.items)
    historyTotal.value = res.total
    historyLoaded.value = true
  } finally {
    historyLoading.value = false
  }
}

function loadMoreHistory() {
  historyPage.value++
  loadHistory()
}

const historyHasMore = computed(() => historyEntries.value.length < historyTotal.value)

function onTabChange(tab: TabId) {
  router.replace({ hash: `#${tab}` })
  if (tab === 'history' && !historyLoaded.value) loadHistory(true)
}

// ── Locale management ─────────────────────────────────────────────
const newLocaleCode = ref('')
const newLocaleName = ref('')
const localeError = ref('')
const localeAdding = ref(false)

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

const selectedKnown = ref('')
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
      body: JSON.stringify({
        code: newLocaleCode.value.trim(),
        name: newLocaleName.value.trim(),
      }),
    })
    locales.value.push(locale)
    localeProgress.value.push({
      id: locale.id,
      code: locale.code,
      name: locale.name,
      approved: 0,
      total: totalKeys.value,
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
    await apiFetch(`/projects/${projectId}/locales/${locale.id}`, {
      method: 'DELETE',
    })
    locales.value = locales.value.filter((l) => l.id !== locale.id)
    localeProgress.value = localeProgress.value.filter((l) => l.id !== locale.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not remove locale')
  }
}

// ── Namespace management ──────────────────────────────────────────
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
    namespaces.value.push(ns)
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
    await apiFetch(`/projects/${projectId}/namespaces/${ns.id}`, {
      method: 'DELETE',
    })
    namespaces.value = namespaces.value.filter((n) => n.id !== ns.id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not remove namespace')
  }
}

// ── Member management ─────────────────────────────────────────────
const newMemberEmail = ref('')
const newMemberRole = ref('TRANSLATOR')
const memberError = ref('')
const memberAdding = ref(false)

const roleOptions = computed<NbSelectOption[]>(() => [
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
    const users = await apiFetch<{ id: string; email: string }[]>(
      `/users?email=${encodeURIComponent(newMemberEmail.value.trim())}`,
    )
    if (!users.length) {
      memberError.value = 'No user found with that email'
      memberAdding.value = false
      return
    }
    const userId = users[0].id
    await apiFetch(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role: newMemberRole.value }),
    })
    await loadMembers()
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
    await apiFetch(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    })
    members.value = members.value.filter((m) => m.userId !== userId)
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
    const m = members.value.find((x) => x.userId === userId)
    if (m) m.role = role
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Could not update role')
  }
}

async function loadMembers() {
  members.value = await apiFetch<Member[]>(`/projects/${projectId}/members`)
}

// ── Locale assignment ────────────────────────────────────────────
const editingLocalesForUser = ref<string | null>(null)
const editingLocaleIds = ref<string[]>([])

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
    const m = members.value.find((x) => x.userId === userId)
    if (m) m.assignedLocales = [...editingLocaleIds.value]
    cancelEditLocales()
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to save locale assignments')
  }
}

// ── Logo ──────────────────────────────────────────────────────────
const logoSaving = ref(false)
async function onLogoChange(dataUrl: string) {
  logoSaving.value = true
  try {
    const updated = await apiFetch<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar: dataUrl }),
    })
    if (project.value) project.value.avatar = updated.avatar
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to save logo')
  } finally {
    logoSaving.value = false
  }
}

// ── Rename project ────────────────────────────────────────────────
const renameEdit = ref('')
const renameSaving = ref(false)
const renameError = ref('')
async function saveRename() {
  renameError.value = ''
  renameSaving.value = true
  try {
    const updated = await apiFetch<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: renameEdit.value }),
    })
    if (project.value) project.value.name = updated.name
  } catch (e) {
    renameError.value = e instanceof Error ? e.message : 'Failed to rename project'
  } finally {
    renameSaving.value = false
  }
}

// ── Delete project ────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deleteConfirmSlug = ref('')
const deleteError = ref('')
const deleting = ref(false)
async function confirmDelete() {
  if (deleteConfirmSlug.value !== project.value?.slug) {
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

// ── AI settings ────────────────────────────────────────────────────
const aiEnabled = ref(false)
const aiProvider = ref('openai')
const aiApiKey = ref('')
const aiApiKeyChanged = ref(false) // true only when user actually types a new key
const aiModel = ref('')
const aiSaving = ref(false)
const aiSaveMsg = ref('')

const aiProviderOptions: NbSelectOption[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Gemini', value: 'gemini' },
]

async function saveAiSettings() {
  aiSaving.value = true
  aiSaveMsg.value = ''
  try {
    const body: Record<string, unknown> = {
      aiEnabled: aiEnabled.value,
      aiProvider: aiProvider.value || null,
      aiModel: aiModel.value || null,
    }
    // Only send aiApiKey if the user actually typed a new value
    if (aiApiKeyChanged.value) {
      body.aiApiKey = aiApiKey.value || null
    }
    const updated = await apiFetch<Project>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    if (project.value) {
      project.value.aiEnabled = updated.aiEnabled
      project.value.aiProvider = updated.aiProvider
      project.value.aiApiKey = updated.aiApiKey
      project.value.aiModel = updated.aiModel
    }
    aiApiKeyChanged.value = false
    aiSaveMsg.value = 'Saved!'
    setTimeout(() => {
      aiSaveMsg.value = ''
    }, 2000)
  } catch (e) {
    aiSaveMsg.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    aiSaving.value = false
  }
}

// ── Data loading ──────────────────────────────────────────────────
async function load() {
  const [proj, keys, locs, translations, submitted, nsList, memberList, taskList] = await Promise.all([
    apiFetch<Project>(`/projects/${projectId}`),
    apiFetch<{ items: unknown[]; total: number }>(`/projects/${projectId}/keys?limit=1`),
    apiFetch<Locale[]>(`/projects/${projectId}/locales`),
    apiFetch<Translation[]>(`/projects/${projectId}/translations?limit=100`),
    apiFetch<unknown[]>(`/projects/${projectId}/translations?status=SUBMITTED&limit=100`),
    apiFetch<Namespace[]>(`/projects/${projectId}/namespaces`),
    apiFetch<Member[]>(`/projects/${projectId}/members`),
    apiFetch<Task[]>('/auth/me/tasks').catch(() => []),
  ])
  project.value = proj
  locales.value = locs
  namespaces.value = nsList
  members.value = memberList
  renameEdit.value = proj.name
  aiEnabled.value = proj.aiEnabled ?? false
  aiProvider.value = proj.aiProvider ?? 'openai'
  aiApiKey.value = '' // never pre-fill; placeholder shows "key already set" if proj.aiApiKey === '***'
  aiApiKeyChanged.value = false
  aiModel.value = proj.aiModel ?? ''
  totalKeys.value = keys.total
  needsReview.value = submitted.length
  tasks.value = (taskList as Task[]).filter((task) => task.key.project.id === projectId)
  localeProgress.value = locs.map((locale) => {
    const lt = (translations as Translation[]).filter((tx) => tx.localeId === locale.id)
    return {
      id: locale.id,
      code: locale.code,
      name: locale.name,
      approved: lt.filter((tx) => tx.status === 'APPROVED').length,
      total: keys.total,
    }
  })
}

onMounted(async () => {
  try {
    await load()
  } finally {
    loading.value = false
  }
})

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#3b82f6',
  SUBMITTED: '#f59e0b',
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString()
}
</script>

<style lang="scss" scoped>
.page-header {
  margin-bottom: 1rem;
  h2 {
    margin: 0.25rem 0 0.2rem;
    font-size: 1.4rem;
  }
  .slug {
    font-size: 0.8rem;
    color: #888;
  }
}

.header-main {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.project-avatar-lg {
  font-size: 2rem;
  line-height: 1;
}
.project-avatar-xl {
  font-size: 3rem;
  line-height: 1;
}

/* Tab bar */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 1.5rem;
}

.tab-btn {
  padding: 0.6rem 1.2rem;
  border: none;
  background: none;
  font-size: 0.88rem;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition:
    color 0.15s,
    border-color 0.15s;
  white-space: nowrap;

  &:hover {
    color: #1a1a2e;
  }
  &.active {
    color: #5b21b6;
    border-bottom-color: #5b21b6;
    font-weight: 600;
  }
}

.tab-content {
  animation: fadeIn 0.15s ease;
}

// Settings tab: two-column layout
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
  border-right: 1px solid #f0f0f8;
  padding: 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-self: stretch;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.48rem 0.7rem;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #4b5563;
  cursor: pointer;
  text-align: left;
  font-weight: 500;
  transition:
    background 0.1s,
    color 0.1s;

  &:hover {
    background: #f5f3ff;
    color: #1a1a2e;
  }

  &.active {
    background: #ede9fe;
    color: #5b21b6;
    font-weight: 600;
  }
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

.stats-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.75rem;
  min-width: 140px;
  text-decoration: none;
  display: block;
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 0.25rem;
    color: #1a1a2e;
  }
  .stat-label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  &.warning .stat-value {
    color: #e67e22;
  }
  &.clickable:hover {
    border-color: #5b21b6;
    box-shadow: 0 2px 8px rgba(91, 33, 182, 0.12);
    cursor: pointer;
  }
}

.section {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.25rem;
  h3 {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
  }
}

/* Namespace count list */
.ns-count-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ns-count-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid #f0f0f0;
  &:last-child {
    border-bottom: none;
  }
}
.ns-count-badge {
  margin-left: auto;
  font-size: 0.75rem;
  background: #f0f0f0;
  color: #555;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
}

/* Task list */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.75rem;
  background: #f7f7f9;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  }
}
.task-key {
  font-size: 0.82rem;
  color: #1a1a2e;
}
.task-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #888;
}

/* Locale list */
.locale-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.locale-row {
  display: grid;
  grid-template-columns: 70px 1fr 120px 70px 28px;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid #f0f0f0;
  &:last-child {
    border-bottom: none;
  }
}
.locale-name {
  font-size: 0.85rem;
  color: #666;
}
.progress-bar-wrap {
  height: 8px;
  background: #eee;
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: #27ae60;
  border-radius: 4px;
  transition: width 0.4s;
}
.progress-label {
  font-size: 0.8rem;
  color: #666;
  text-align: right;
}

/* Settings info */
.settings-info-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.info-line {
  font-size: 0.88rem;
  margin-bottom: 0.25rem;
}
.info-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  margin-right: 0.5rem;
}
.enabled-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  &.enabled {
    background: #d5f5e3;
    color: #1e8449;
  }
  &.disabled {
    background: #f0f0f0;
    color: #888;
  }
}

/* Common */
.icon-btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.15rem 0.35rem;
  line-height: 1;
  &:hover {
    background: #f0f0f0;
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

.btn-add {
  padding: 0.45rem 0.9rem;
  background: #1a1a2e;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: #2a2a4e;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-cancel {
  padding: 0.45rem 0.9rem;
  background: #fff;
  color: #555;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  &:hover {
    background: #f0f0f0;
  }
}

.field-error {
  color: #c0392b;
  font-size: 0.82rem;
  margin: 0.35rem 0 0;
}
.empty-note {
  color: #888;
  font-size: 0.9rem;
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
  border-bottom: 1px solid #f0f0f0;
  &:last-child {
    border-bottom: none;
  }
}
.simple-label {
  font-size: 0.85rem;
  color: #666;
  flex: 1;
}
.member-email {
  font-size: 0.875rem;
  flex: 1;
}
.member-row-wrap {
  border-bottom: 1px solid #f0f0f0;
  padding: 0.3rem 0;
  &:last-child {
    border-bottom: none;
  }
}
.assigned-locales-summary {
  font-size: 0.75rem;
  color: #888;
  margin: 0.1rem 0 0.3rem;
}

.locale-assignment-editor {
  margin: 0.5rem 0 0.75rem;
  padding: 0.75rem;
  background: #f7f7f9;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}
.locale-assignment-hint {
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.5rem;
}
.locale-assignment-actions {
  display: flex;
  gap: 0.5rem;
}

.ns-tag {
  font-size: 0.78rem;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
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

.settings-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  label {
    font-size: 0.85rem;
    color: #555;
    font-weight: 600;
  }
}
.avatar-input {
  width: 80px;
  text-align: center;
}

/* AI Settings */
.ai-settings {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.ai-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  label {
    font-size: 0.82rem;
    font-weight: 600;
    color: #555;
    min-width: 70px;
  }
}
.ai-input {
  flex: 1;
  max-width: 400px;
}
.ai-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.save-msg {
  font-size: 0.82rem;
  color: #27ae60;
}
.ai-note {
  font-size: 0.78rem;
  color: #b96a00;
  margin: 0.25rem 0 0;
}
.ai-provider-note {
  font-size: 0.78rem;
  color: #555;
  margin: 0.25rem 0 0.5rem;
  a {
    color: #4f46e5;
  }
  code {
    background: #f0f0f0;
    padding: 0 0.3em;
    border-radius: 3px;
  }
}

/* History */
.history-section {
  padding: 0;
  overflow: hidden;
}
.history-section > h3 {
  padding: 1.25rem 1.5rem 0;
  margin-bottom: 0.75rem;
}

.history-table-wrap {
  overflow-y: auto;
  max-height: 500px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th,
  td {
    padding: 0.6rem 1.5rem;
    text-align: left;
  }
  th {
    background: #f7f7f9;
    font-size: 0.72rem;
    font-weight: 600;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #e0e0e0;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  tr + tr td {
    border-top: 1px solid #f5f5f5;
  }
  tr:hover td {
    background: #fafafa;
  }
}

.action-code {
  font-size: 0.8rem;
  color: #5b21b6;
  background: #ede9fe;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}
.entity-type {
  font-size: 0.78rem;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-weight: 600;
}
.time-cell {
  color: #888;
  font-size: 0.8rem;
  white-space: nowrap;
}

.load-more {
  padding: 1rem 1.5rem;
}

.skeleton-header {
  height: 120px;
  background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 8px;
}
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.rename-input {
  flex: 1;
  max-width: 280px;
}

.danger-zone {
  border: 1px solid #fca5a5;
  border-radius: 8px;
  background: #fff8f8;

  h3 {
    color: #dc2626;
  }
}

.danger-description {
  font-size: 0.88rem;
  color: #6b7280;
  margin: 0 0 0.85rem;
  line-height: 1.5;
}

.delete-confirm-box {
  margin-top: 1rem;
  padding: 1rem;
  background: #fff;
  border: 1px solid #fca5a5;
  border-radius: 6px;

  p {
    margin: 0 0 0.6rem;
    font-size: 0.875rem;
    color: #374151;
  }
}

.delete-confirm-input {
  width: 100%;
  max-width: 300px;
  margin-bottom: 0.75rem;
}

.delete-confirm-actions {
  display: flex;
  gap: 0.6rem;
}
</style>
