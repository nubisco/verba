<template>
  <Teleport v-if="!compact && keyData" defer to="#verba-topbar">
    <NbGrid align="center" justify="between" class="page-topbar" grow>
      <NbBreadcrumbs title="Nubisco" subtitle="Verba">{{ keyData.name }}</NbBreadcrumbs>
    </NbGrid>
  </Teleport>

  <div class="key-detail-panel" :class="{ compact }">
    <div v-if="loading" class="skeleton-block" />
    <template v-else-if="keyData">
      <div class="page-header">
        <template v-if="false"><!-- breadcrumb moved to topbar --></template>
        <div class="header-row">
          <h2>
            <code>{{ keyData.name }}</code>
          </h2>
          <NbButton v-if="userRole === 'ADMIN'" variant="danger" @click="deleteKey">
            {{ t('keys.detail.deleteKey') }}
          </NbButton>
        </div>
        <div class="meta">
          <span class="ns-badge">{{ nsSlug }}</span>
          <span v-if="keyData.description" class="description">{{ keyData.description }}</span>
        </div>
      </div>

      <div class="translations-section">
        <h3>{{ t('keys.detail.translations') }}</h3>
        <div v-if="locales.length === 0" class="empty-note">
          {{ t('keys.detail.noLocales') }}
        </div>
        <template v-else>
          <div v-if="!compact" class="layout-toggle">
            <NbButton
              :class="['toggle-btn', { active: layoutMode === 'stacked' }]"
              :title="t('keys.detail.layout.stacked')"
              @click="layoutMode = 'stacked'"
            >
              ≡
            </NbButton>
            <NbButton
              :class="['toggle-btn', { active: layoutMode === 'side-by-side' }]"
              :title="t('keys.detail.layout.sideBySide')"
              @click="layoutMode = 'side-by-side'"
            >
              ⊞
            </NbButton>
          </div>

          <!-- Locale tabs: only shown when user has specific assignments -->
          <div v-if="otherLocales.length > 0" class="locale-tabs">
            <NbButton :class="['locale-tab', { active: localeTab === 'mine' }]" @click="localeTab = 'mine'">
              {{ t('keys.tabs.myLanguages', { count: myLocales.length }) }}
            </NbButton>
            <NbButton :class="['locale-tab', { active: localeTab === 'others' }]" @click="localeTab = 'others'">
              {{ t('keys.tabs.otherLanguages', { count: otherLocales.length }) }}
            </NbButton>
          </div>

          <!-- Read-only view of other locales -->
          <div v-if="localeTab === 'others' && otherLocales.length > 0" class="locale-rows other-locales">
            <div v-for="locale in otherLocales" :key="locale.id" class="locale-row">
              <div class="locale-header">
                <LocaleBadge :code="locale.code" />
                <NbBadge :variant="statusVariant[translations.get(locale.id)?.status ?? 'TODO'] ?? 'grey'">
                  {{ statusLabel(translations.get(locale.id)?.status ?? 'TODO') }}
                </NbBadge>
              </div>
              <div class="read-only-translation">
                {{ translations.get(locale.id)?.text || t('keys.detail.noTranslation') }}
              </div>
            </div>
          </div>

          <!-- Editable locale rows -->
          <div
            v-if="localeTab === 'mine' || otherLocales.length === 0"
            class="locale-rows"
            :class="{
              'locale-rows--side-by-side': layoutMode === 'side-by-side' && !compact,
            }"
          >
            <div v-for="locale in myLocales" :key="locale.id" class="locale-row">
              <div class="locale-header">
                <LocaleBadge :code="locale.code" />
                <NbBadge :variant="statusVariant[translations.get(locale.id)?.status ?? 'TODO'] ?? 'grey'">
                  {{ statusLabel(translations.get(locale.id)?.status ?? 'TODO') }}
                </NbBadge>
              </div>
              <TranslationEditor
                :model-value="editText.get(locale.id) ?? ''"
                :disabled="!isEditable() || isLocked(translations.get(locale.id))"
                :multiline="true"
                :available-keys="allKeyNames"
                :show-suggest="projectAiEnabled && isEditable() && !isLocked(translations.get(locale.id))"
                :suggesting="aiSuggesting.get(locale.id)"
                @update:model-value="onTextChange(locale.id, $event)"
                @focus="sendEditing(keyId)"
                @suggest="requestAiSuggestion(locale.id, locale.code)"
              />
              <div class="translation-hint">
                {{ t('keys.detail.hint') }}
              </div>
              <div v-if="editText.get(locale.id)" class="translation-preview">
                <TranslationText :text="editText.get(locale.id) ?? ''" :key-map="keyMapByLocale.get(locale.id) ?? {}" />
              </div>
              <div v-if="isLocked(translations.get(locale.id))" class="lock-notice">
                {{
                  t('keys.detail.locked', {
                    user: assignedUserLabel(translations.get(locale.id)),
                  })
                }}
              </div>
              <div class="row-actions">
                <span v-if="saving.get(locale.id)" class="autosave-indicator">{{ t('keys.detail.saving') }}</span>
                <span v-else-if="saveError.get(locale.id)" class="save-error">{{ saveError.get(locale.id) }}</span>
                <NbButton
                  v-for="action in nextStatuses(translations.get(locale.id)?.status ?? 'TODO', userRole)"
                  :key="action.value"
                  :variant="action.variant"
                  :disabled="isLocked(translations.get(locale.id))"
                  @click="!isLocked(translations.get(locale.id)) && changeStatus(locale.id, action.value)"
                >
                  {{ action.label }}
                </NbButton>
                <span v-if="saveError.get(locale.id)" class="save-error">
                  {{ saveError.get(locale.id) }}
                </span>
              </div>
              <!-- AI suggestion box -->
              <div v-if="aiSuggestion.get(locale.id)" class="ai-suggestion-box">
                <span class="ai-suggestion-label">✨ Suggestion:</span>
                <span class="ai-suggestion-text">{{ aiSuggestion.get(locale.id) }}</span>
                <NbButton variant="primary" @click="useAiSuggestion(locale.id)">Use this</NbButton>
                <NbButton @click="aiSuggestion.set(locale.id, '')">✕</NbButton>
              </div>
              <div v-if="aiSuggestError.get(locale.id)" class="ai-error">
                {{ aiSuggestError.get(locale.id) }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Translation testing panel: appears when translations have variables or plural forms -->
      <div class="tester-section">
        <TranslationTester :translations="testerTranslations" :locales="locales" />
      </div>

      <div class="comments-section">
        <div class="section-tabs">
          <NbButton :class="['tab-btn', { active: activeTab === 'comments' }]" @click="switchTab('comments')">
            {{ t('keys.detail.comments') }}
          </NbButton>
          <NbButton :class="['tab-btn', { active: activeTab === 'history' }]" @click="switchTab('history')">
            {{ t('keys.detail.history') }}
          </NbButton>
        </div>

        <template v-if="activeTab === 'comments'">
          <div v-if="!primaryTranslationId" class="empty-note">
            {{ t('keys.detail.saveForComments') }}
          </div>
          <template v-else>
            <div v-if="comments.length === 0" class="empty-note">
              {{ t('keys.detail.noComments') }}
            </div>
            <div v-else class="comment-list">
              <div
                v-for="c in flatComments"
                :key="c.id"
                class="comment"
                :class="{ 'comment-reply': c.depth > 0 }"
                :style="{ marginLeft: `${c.depth * 1.5}rem` }"
              >
                <div class="comment-header">
                  <span class="comment-meta">
                    {{ c.user ? displayName(c.user) : c.userId }} ·
                    {{ formatTime(c.createdAt) }}
                  </span>
                  <NbButton
                    v-if="c.userId === auth.user?.id || ['MAINTAINER', 'ADMIN'].includes(userRole)"
                    class="btn-delete-comment"
                    title="Delete comment"
                    @click="deleteCommentById(c.id)"
                  >
                    ×
                  </NbButton>
                </div>
                <p class="comment-text">
                  <template v-for="(seg, i) in parseMentions(c.text)" :key="i">
                    <span v-if="seg.type === 'mention'" class="mention">{{ seg.value }}</span>
                    <template v-else>{{ seg.value }}</template>
                  </template>
                </p>
                <NbButton class="btn-reply" @click="replyingTo = c.id">
                  {{ t('keys.detail.reply') }}
                </NbButton>
                <div v-if="replyingTo === c.id" class="reply-form">
                  <NbTextInput v-model="replyText" multiline :rows="2" :placeholder="t('keys.detail.writeReply')" />
                  <div class="reply-actions">
                    <NbButton @click="submitReply(c.id)">
                      {{ t('keys.detail.send') }}
                    </NbButton>
                    <NbButton
                      @click="
                        () => {
                          replyingTo = null
                          replyText = ''
                        }
                      "
                    >
                      {{ t('common.cancel') }}
                    </NbButton>
                  </div>
                </div>
              </div>
            </div>
            <div class="comment-form">
              <NbTextInput
                id="new-comment-ta"
                v-model="newComment"
                :placeholder="t('keys.detail.addComment')"
                multiline
                :rows="2"
                @input="onNewCommentInput"
                @keydown="onNewCommentKeydown"
              >
                <template v-if="mentionActive && mentionSuggestions.length > 0" #dropdown>
                  <div class="mention-dropdown">
                    <div
                      v-for="(m, i) in mentionSuggestions"
                      :key="m.userId"
                      class="mention-item"
                      :class="{ active: i === mentionIndex }"
                      @mousedown.prevent="insertMention(m)"
                    >
                      <span class="mention-name">{{ m.user?.name?.trim() || m.user?.email }}</span>
                      <span v-if="m.user?.name" class="mention-email">{{ m.user?.email }}</span>
                    </div>
                  </div>
                </template>
              </NbTextInput>
              <NbButton variant="primary" @click="addComment">
                {{ t('keys.detail.addCommentBtn') }}
              </NbButton>
            </div>
          </template>
        </template>

        <div v-if="activeTab === 'history'" class="history-tab">
          <div v-if="historyLoading" class="history-empty">
            {{ t('keys.detail.historyLoading') }}
          </div>
          <div v-else-if="!historyEntries.length" class="history-empty">
            {{ t('keys.detail.noHistory') }}
          </div>
          <div v-else class="history-list">
            <div v-for="entry in historyEntries" :key="entry.id" class="history-entry">
              <span class="history-actor">{{ entry.user ? displayName(entry.user) : 'System' }}</span>
              <span class="history-action">{{ formatHistoryAction(entry) }}</span>
              <span class="history-time">{{ formatTime(entry.createdAt) }}</span>
            </div>
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
import { useProjectWs } from '../composables/useProjectWs'
import { displayName } from '../composables/useDisplayName'
import TranslationText from './TranslationText.vue'
import TranslationEditor from './TranslationEditor.vue'
import TranslationTester from './TranslationTester.vue'
import LocaleBadge from './LocaleBadge.vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  projectId: string
  keyId: string
  compact?: boolean
  initialDrafts?: Record<string, string> // localeId → draft text
  aiEnabled?: boolean
}>()
const emit = defineEmits<{
  deleted: []
  textDraft: [localeId: string, text: string]
}>()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()

interface Key {
  id: string
  name: string
  description?: string
  namespaceId: string
}

interface Namespace {
  id: string
  slug: string
}

interface Locale {
  id: string
  code: string
}

interface Translation {
  id: string
  keyId: string
  localeId: string
  text: string
  status: string
  assignedToId?: string | null
}

interface Comment {
  id: string
  text: string
  userId: string
  createdAt: string
  parentId?: string | null
  user?: { id: string; email: string; name?: string | null }
  replies?: Comment[]
}

interface Member {
  userId: string
  role: string
  assignedLocales?: string[]
  user?: { id: string; email: string; name?: string | null }
}

interface HistoryEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  localeCode?: string
  createdAt: string
  user: { id: string; email: string; name?: string | null } | null
  meta?: { text?: string }
}

const loading = ref(true)
const keyData = ref<Key | null>(null)
const nsSlug = ref('')
const locales = ref<Locale[]>([])
const translations = ref<Map<string, Translation>>(new Map())
const editText = ref<Map<string, string>>(new Map())
const saving = ref<Map<string, boolean>>(new Map())
const saveError = ref<Map<string, string>>(new Map())
const userRole = ref<string>('READER')
const comments = ref<Comment[]>([])
const newComment = ref('')
const primaryTranslationId = ref<string | null>(null)
const members = ref<Member[]>([])

const assignedLocaleIds = ref<string[]>([]) // IDs of locales assigned to me; empty = all
const localeTab = ref<'mine' | 'others'>('mine')

const VALID_KEY_TABS = ['comments', 'history'] as const
type KeyTab = (typeof VALID_KEY_TABS)[number]
const activeTab = computed<KeyTab>(() => {
  const hash = route.hash.slice(1) as KeyTab
  return VALID_KEY_TABS.includes(hash) ? hash : 'comments'
})
const historyEntries = ref<HistoryEntry[]>([])
const historyLoading = ref(false)
const historyLoaded = ref(false)
const allKeyNames = ref<string[]>([])
const keyMapByLocale = ref<Map<string, Record<string, string>>>(new Map())
const layoutMode = ref<'stacked' | 'side-by-side'>('stacked')

// AI suggestion state
const aiSuggesting = ref<Map<string, boolean>>(new Map())
const aiSuggestion = ref<Map<string, string>>(new Map())
const aiSuggestError = ref<Map<string, string>>(new Map())
const projectAiEnabled = ref(props.aiEnabled ?? false)

// Auto-save: debounce timers per locale
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Track locales where we've already auto-transitioned from TODO→IN_PROGRESS
const autoStarted = new Set<string>()

function scheduleAutoSave(localeId: string) {
  if (saveTimers.has(localeId)) clearTimeout(saveTimers.get(localeId)!)
  saveTimers.set(
    localeId,
    setTimeout(() => {
      saveTimers.delete(localeId)
      saveTranslation(localeId)
    }, 1500),
  )
}

async function onTextChange(localeId: string, value: string) {
  editText.value.set(localeId, value)
  emit('textDraft', localeId, value)

  // Auto-transition TODO → IN_PROGRESS on first edit
  const current = translations.value.get(localeId)
  if (current?.status === 'TODO' && !autoStarted.has(localeId)) {
    autoStarted.add(localeId)
    try {
      const updated = await apiFetch<Translation>(`/projects/${props.projectId}/translations/${current.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      })
      translations.value = new Map(translations.value.set(localeId, updated))
    } catch {
      /* non-critical; save will still work */
    }
  }

  scheduleAutoSave(localeId)
}

async function requestAiSuggestion(localeId: string, localeCode: string) {
  aiSuggesting.value = new Map(aiSuggesting.value.set(localeId, true))
  aiSuggestion.value = new Map(aiSuggestion.value.set(localeId, ''))
  aiSuggestError.value = new Map(aiSuggestError.value.set(localeId, ''))
  try {
    const res = await apiFetch<{ suggestion: string }>(`/projects/${props.projectId}/ai/suggest`, {
      method: 'POST',
      body: JSON.stringify({ keyId: props.keyId, localeCode }),
    })
    aiSuggestion.value = new Map(aiSuggestion.value.set(localeId, res.suggestion))
  } catch (e: unknown) {
    aiSuggestError.value = new Map(
      aiSuggestError.value.set(localeId, e instanceof Error ? e.message : 'AI suggestion failed'),
    )
  } finally {
    aiSuggesting.value = new Map(aiSuggesting.value.set(localeId, false))
  }
}

function useAiSuggestion(localeId: string) {
  const suggestion = aiSuggestion.value.get(localeId)
  if (!suggestion) return
  editText.value.set(localeId, suggestion)
  emit('textDraft', localeId, suggestion)
  aiSuggestion.value = new Map(aiSuggestion.value.set(localeId, ''))
}

const replyingTo = ref<string | null>(null)
const replyText = ref('')

// @mention autocomplete state
const mentionQuery = ref('')
const mentionActive = ref(false)
const mentionIndex = ref(0)

const mentionSuggestions = computed(() => {
  if (!mentionQuery.value) return members.value.slice(0, 8)
  const q = mentionQuery.value.toLowerCase()
  return members.value
    .filter((m) => {
      const nameNorm = (m.user?.name ?? '').toLowerCase()
      const email = (m.user?.email ?? '').toLowerCase()
      return nameNorm.includes(q) || email.includes(q)
    })
    .slice(0, 8)
})

function getMentionToken(member: Member): string {
  if (member.user?.name?.trim()) return member.user.name.trim().replace(/\s+/g, '')
  return (member.user?.email ?? '').split('@')[0]
}

function onNewCommentInput(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  const val = ta.value
  const pos = ta.selectionStart ?? val.length
  const before = val.slice(0, pos)
  const atMatch = before.match(/@([\w.-]*)$/)
  if (atMatch) {
    mentionQuery.value = atMatch[1]
    mentionActive.value = true
    mentionIndex.value = 0
  } else {
    mentionActive.value = false
    mentionQuery.value = ''
  }
}

function onNewCommentKeydown(e: KeyboardEvent) {
  if (!mentionActive.value || mentionSuggestions.value.length === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    mentionIndex.value = (mentionIndex.value + 1) % mentionSuggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    mentionIndex.value = (mentionIndex.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    insertMention(mentionSuggestions.value[mentionIndex.value])
  } else if (e.key === 'Escape') {
    mentionActive.value = false
  }
}

function insertMention(member: Member) {
  const token = getMentionToken(member)
  // Replace the @query text with @token
  const ta = document.getElementById('new-comment-ta') as HTMLTextAreaElement | null
  if (!ta) return
  const val = ta.value
  const pos = ta.selectionStart ?? val.length
  const before = val.slice(0, pos)
  const after = val.slice(pos)
  const replaced = before.replace(/@([\w.-]*)$/, `@${token} `)
  newComment.value = replaced + after
  mentionActive.value = false
  mentionQuery.value = ''
  // Restore focus
  ta.focus()
}

function parseMentions(text: string): Array<{ type: 'text' | 'mention'; value: string }> {
  const parts: Array<{ type: 'text' | 'mention'; value: string }> = []
  const regex = /@([\w.-]+)/g
  let last = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    parts.push({ type: 'mention', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
}

const { sendEditing } = useProjectWs(props.projectId, (msg) => {
  if (msg.type === 'comment.added' && msg.translationId === primaryTranslationId.value) {
    reloadComments(primaryTranslationId.value!)
  }
})

async function reloadComments(translationId: string) {
  comments.value = await apiFetch<Comment[]>(`/projects/${props.projectId}/translations/${translationId}/comments`)
}

async function loadHistory() {
  if (historyLoaded.value) return
  historyLoading.value = true
  try {
    historyEntries.value = await apiFetch<HistoryEntry[]>(`/projects/${props.projectId}/keys/${props.keyId}/history`)
    historyLoaded.value = true
  } finally {
    historyLoading.value = false
  }
}

function switchTab(tab: KeyTab) {
  router.replace({ hash: `#${tab}` })
  if (tab === 'history') loadHistory()
}

async function submitReply(parentId: string) {
  if (!replyText.value.trim() || !primaryTranslationId.value) return
  await apiFetch(`/projects/${props.projectId}/translations/${primaryTranslationId.value}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text: replyText.value.trim(), parentId }),
  })
  replyText.value = ''
  replyingTo.value = null
  await reloadComments(primaryTranslationId.value)
}

function formatHistoryAction(entry: HistoryEntry): string {
  const locale = entry.localeCode ? ` [${entry.localeCode}]` : ''
  switch (entry.action) {
    case 'key.created':
      return 'created this key'
    case 'key.deleted':
      return 'deleted this key'
    case 'key.restored':
      return 'restored this key'
    case 'translation.updated_text':
      return `updated translation${locale}`
    case 'translation.status_changed':
      return `changed status${locale}`
    case 'translation.approved':
      return `approved translation${locale}`
    case 'translation.assigned':
      return `assigned translation${locale}`
    case 'translation.unassigned':
      return `unassigned translation${locale}`
    case 'comment.added':
      return entry.meta?.text
        ? `commented: "${entry.meta.text}${entry.meta.text.length >= 80 ? '…' : ''}"`
        : 'added a comment'
    default:
      return entry.action.replace('.', ' ')
  }
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString()
}

onMounted(async () => {
  try {
    const [key, locs, trans, loadedMembers, namespaces, proj] = await Promise.all([
      apiFetch<Key>(`/projects/${props.projectId}/keys/${props.keyId}`),
      apiFetch<Locale[]>(`/projects/${props.projectId}/locales`),
      apiFetch<Translation[]>(`/projects/${props.projectId}/translations?keyId=${props.keyId}&limit=100`),
      apiFetch<Member[]>(`/projects/${props.projectId}/members`),
      apiFetch<Namespace[]>(`/projects/${props.projectId}/namespaces`),
      apiFetch<{ aiEnabled?: boolean }>(`/projects/${props.projectId}`),
    ])

    keyData.value = key
    locales.value = locs

    const nsMatch = namespaces.find((n) => n.id === key.namespaceId)
    nsSlug.value = nsMatch?.slug ?? key.namespaceId

    const tMap = new Map<string, Translation>()
    const textMap = new Map<string, string>()
    for (const t of trans) {
      tMap.set(t.localeId, t)
      // Restore draft if one was staged before navigating away
      textMap.set(t.localeId, props.initialDrafts?.[t.localeId] ?? t.text ?? '')
    }
    translations.value = tMap
    editText.value = textMap
    members.value = loadedMembers

    // Use project's aiEnabled (fetched fresh) with prop as fallback
    if (proj.aiEnabled !== undefined) projectAiEnabled.value = proj.aiEnabled

    const me = auth.user
    if (me) {
      const myMembership = loadedMembers.find((m) => m.userId === me.id)
      userRole.value = myMembership?.role ?? 'READER'
      assignedLocaleIds.value = myMembership?.assignedLocales ?? []
    }

    if (trans.length > 0) {
      primaryTranslationId.value = trans[0].id
      comments.value = await apiFetch<Comment[]>(`/projects/${props.projectId}/translations/${trans[0].id}/comments`)
    }

    // Load all project keys for autocomplete + reference preview keyMap
    try {
      const allKeys = await apiFetch<{
        items: Array<{
          name: string
          translations?: Array<{ localeId: string; text: string }>
        }>
      }>(`/projects/${props.projectId}/keys?limit=500&includeTranslations=true`)
      allKeyNames.value = allKeys.items.map((k) => k.name)
      const kMap = new Map<string, Record<string, string>>()
      for (const key of allKeys.items) {
        for (const t of key.translations ?? []) {
          if (!kMap.has(t.localeId)) kMap.set(t.localeId, {})
          kMap.get(t.localeId)![key.name] = t.text
        }
      }
      keyMapByLocale.value = kMap
    } catch {
      // non-critical
    }
  } finally {
    loading.value = false
  }
})

async function saveTranslation(localeId: string) {
  saving.value = new Map(saving.value.set(localeId, true))
  saveError.value = new Map(saveError.value.set(localeId, ''))
  try {
    const prevStatus = translations.value.get(localeId)?.status ?? 'TODO'
    const t = await apiFetch<Translation>(`/projects/${props.projectId}/keys/${props.keyId}/translations/${localeId}`, {
      method: 'PUT',
      body: JSON.stringify({ text: editText.value.get(localeId) ?? '' }),
    })
    translations.value = new Map(translations.value.set(localeId, t))
    if (!primaryTranslationId.value) {
      primaryTranslationId.value = t.id
    }
    if (prevStatus === 'TODO' && auth.user?.id) {
      try {
        await apiFetch(`/projects/${props.projectId}/translations/${t.id}/assign`, {
          method: 'PATCH',
          body: JSON.stringify({ assigneeId: auth.user.id }),
        })
      } catch {
        // non-critical
      }
    }
    const refreshed = await apiFetch<Translation>(`/projects/${props.projectId}/translations/${t.id}`)
    translations.value = new Map(translations.value.set(localeId, refreshed))
  } catch (e: unknown) {
    saveError.value = new Map(saveError.value.set(localeId, e instanceof Error ? e.message : 'Save failed'))
  } finally {
    saving.value = new Map(saving.value.set(localeId, false))
  }
}

async function changeStatus(localeId: string, newStatus: string) {
  const t = translations.value.get(localeId)
  if (!t) return
  try {
    const updated = await apiFetch<Translation>(`/projects/${props.projectId}/translations/${t.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    })
    translations.value = new Map(translations.value.set(localeId, updated))
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to update status')
  }
}

async function addComment() {
  if (!primaryTranslationId.value || !newComment.value.trim()) return
  try {
    const comment = await apiFetch<Comment>(
      `/projects/${props.projectId}/translations/${primaryTranslationId.value}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ text: newComment.value.trim() }),
      },
    )
    comments.value.push(comment)
    newComment.value = ''
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to add comment')
  }
}

async function deleteCommentById(commentId: string) {
  if (!primaryTranslationId.value) return
  try {
    await apiFetch(`/projects/${props.projectId}/translations/${primaryTranslationId.value}/comments/${commentId}`, {
      method: 'DELETE',
    })
    comments.value = comments.value.filter((c) => c.id !== commentId)
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to delete comment')
  }
}

function buildCommentTree(flat: Comment[]): Comment[] {
  const map = new Map<string, Comment>()
  flat.forEach((c) => {
    map.set(c.id, { ...c, replies: [] })
  })
  const roots: Comment[] = []
  map.forEach((c) => {
    if (c.parentId) {
      const parent = map.get(c.parentId)
      if (parent) parent.replies!.push(c)
      else roots.push(c)
    } else {
      roots.push(c)
    }
  })
  return roots
}

function flattenTree(nodes: Comment[], depth = 0): Array<Comment & { depth: number }> {
  const result: Array<Comment & { depth: number }> = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    if (node.replies?.length) {
      result.push(...flattenTree(node.replies, depth + 1))
    }
  }
  return result
}

const commentTree = computed(() => buildCommentTree(comments.value))
const flatComments = computed(() => flattenTree(commentTree.value))

const myLocales = computed(() =>
  assignedLocaleIds.value.length === 0
    ? locales.value
    : locales.value.filter((l) => assignedLocaleIds.value.includes(l.id)),
)
const otherLocales = computed(() =>
  assignedLocaleIds.value.length === 0 ? [] : locales.value.filter((l) => !assignedLocaleIds.value.includes(l.id)),
)

// Map of localeId → current (edited) text for the testing panel
const testerTranslations = computed<Map<string, string>>(() => {
  const m = new Map<string, string>()
  for (const locale of locales.value) {
    const text = editText.value.get(locale.id) ?? translations.value.get(locale.id)?.text ?? ''
    if (text) m.set(locale.id, text)
  }
  return m
})

async function deleteKey() {
  if (!confirm(t('keys.detail.confirmDelete'))) return
  try {
    await apiFetch(`/projects/${props.projectId}/keys/${props.keyId}`, {
      method: 'DELETE',
    })
    emit('deleted')
    if (!props.compact) {
      router.push(`/keys/${props.projectId}`)
    }
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : 'Failed to delete key')
  }
}

function nextStatuses(status: string, role: string): { label: string; value: string; variant: string }[] {
  const actions: { label: string; value: string; variant: string }[] = []
  const isTranslator = ['TRANSLATOR', 'MAINTAINER', 'ADMIN'].includes(role)
  const isMaintainer = ['MAINTAINER', 'ADMIN'].includes(role)

  // TODO→IN_PROGRESS is handled automatically on first edit (no "Start Working" button)
  if (status === 'IN_PROGRESS' && isTranslator)
    actions.push({
      label: t('keys.status.submit'),
      value: 'SUBMITTED',
      variant: 'warning',
    })
  if (status === 'SUBMITTED' && isMaintainer) {
    actions.push({
      label: t('keys.status.approve'),
      value: 'APPROVED',
      variant: 'success',
    })
    actions.push({
      label: t('keys.status.reject'),
      value: 'IN_PROGRESS',
      variant: 'danger',
    })
  }
  if (status === 'APPROVED' && isMaintainer)
    actions.push({
      label: t('keys.status.reopen'),
      value: 'IN_PROGRESS',
      variant: 'secondary',
    })
  return actions
}

const statusVariant: Record<string, 'grey' | 'blue' | 'orange' | 'green'> = {
  TODO: 'grey',
  IN_PROGRESS: 'blue',
  SUBMITTED: 'orange',
  APPROVED: 'green',
}

function statusLabel(status: string): string {
  return (
    {
      TODO: t('common.status.TODO'),
      IN_PROGRESS: t('common.status.IN_PROGRESS'),
      SUBMITTED: t('common.status.SUBMITTED'),
      APPROVED: t('common.status.APPROVED'),
    }[status] ?? status
  )
}

function isEditable() {
  return ['TRANSLATOR', 'MAINTAINER', 'ADMIN'].includes(userRole.value)
}

function isLocked(t: Translation | undefined): boolean {
  if (!t?.assignedToId) return false
  if (t.assignedToId === auth.user?.id) return false
  if (['MAINTAINER', 'ADMIN'].includes(userRole.value)) return false
  return true
}

function assignedUserLabel(t: Translation | undefined): string {
  if (!t?.assignedToId) return ''
  const m = members.value.find((x) => x.userId === t.assignedToId)
  return m?.user?.email ?? t.assignedToId
}
</script>

<style lang="scss" scoped>
.key-detail-panel {
  max-width: 800px;

  &.compact {
    max-width: none;
    padding: 1rem;
  }
}

.page-header {
  margin-bottom: 1.5rem;

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h2 {
    margin: 0.25rem 0 0.4rem;
    font-size: 1.3rem;

    code {
      font-size: 1.1rem;
      background: #f0f0f0;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
}

.breadcrumb {
  font-size: 0.85rem;
  color: #1a1a2e;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}

.ns-badge {
  font-size: 0.78rem;
  background: #e0e7ff;
  color: #3730a3;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.description {
  font-size: 0.85rem;
  color: #666;
}

.translations-section,
.tester-section,
.comments-section {
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

.locale-rows {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  &--side-by-side {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    align-items: start;
  }
}

.locale-row {
  padding-bottom: 1.25rem;
  border-bottom: 1px solid #f0f0f0;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}

.locale-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.btn-action {
  padding: 0.4rem 0.85rem;
  border: none;
  border-radius: 4px;
  font-size: 0.82rem;
  cursor: pointer;
}

.btn-start {
  background: #2980b9;
  color: #fff;
  &:hover {
    background: #1a6fa8;
  }
}

.save-error {
  color: #c0392b;
  font-size: 0.8rem;
}

.autosave-indicator {
  font-size: 0.78rem;
  color: #888;
  font-style: italic;
}

.lock-notice {
  font-size: 0.78rem;
  color: #888;
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.translation-hint {
  font-size: 0.75rem;
  color: #999;
  margin-top: 0.3rem;

  code {
    background: #f0f0f0;
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
}

.translation-preview {
  margin-top: 0.35rem;
  padding: 0.3rem 0.5rem;
  background: #f7f7f9;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
  font-size: 0.875rem;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.comment {
  background: #f7f7f9;
  border-radius: 6px;
  padding: 0.6rem 0.85rem;

  .comment-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.2rem;
  }

  .comment-meta {
    font-size: 0.75rem;
    color: #999;
    display: block;
  }

  .comment-text {
    margin: 0;
    font-size: 0.875rem;
  }
}

.btn-delete-comment {
  background: none;
  border: none;
  color: #aaa;
  font-size: 0.9rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.15rem;
  &:hover {
    color: #e74c3c;
  }
}

.comment-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mention-dropdown {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 50;
  max-height: 200px;
  overflow-y: auto;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  cursor: pointer;
  font-size: 0.82rem;

  &:hover,
  &.active {
    background: #f0eeff;
  }
}

.mention-name {
  font-weight: 600;
  color: #1a1a2e;
}
.mention-email {
  color: #999;
  font-size: 0.75rem;
}

.empty-note {
  color: #888;
  font-size: 0.875rem;
}

.skeleton-block {
  height: 300px;
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

.section-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  border-bottom: 2px solid #e0e0e0;
}
.tab-btn {
  background: none;
  border: none;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  &.active {
    color: #4f46e5;
    border-bottom-color: #4f46e5;
    font-weight: 600;
  }
  &:hover:not(.active) {
    color: #333;
  }
}
.comment-reply {
  margin-left: 1.5rem;
  margin-top: 0.4rem;
  padding: 0.4rem 0.6rem;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 0.8rem;
  p {
    margin: 0.2rem 0 0;
  }
}
.comment-author {
  font-weight: 600;
}
.comment-time {
  color: #999;
  font-size: 0.75rem;
}
.btn-reply {
  background: none;
  border: none;
  color: #4f46e5;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  &:hover {
    text-decoration: underline;
  }
}
.reply-form {
  margin-left: 1.5rem;
  margin-top: 0.4rem;
  .reply-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }
}
.history-tab {
  padding: 0.25rem 0;
}
.history-empty {
  color: #999;
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem 0;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.history-entry {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.4rem;
  align-items: baseline;
  font-size: 0.8rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid #f0f0f0;
}
.history-actor {
  font-weight: 600;
  color: #1a1a2e;
  white-space: nowrap;
}
.history-action {
  color: #444;
}
.history-time {
  color: #999;
  white-space: nowrap;
  font-size: 0.75rem;
}

.layout-toggle {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
.toggle-btn {
  padding: 0.2rem 0.5rem;
  border: 1px solid #d0d0d0;
  background: #f5f5f5;
  border-radius: 3px;
  cursor: pointer;
  font-size: 1rem;
  color: #666;
  &.active {
    border-color: #4f46e5;
    background: #ede9fe;
    color: #4f46e5;
  }
}
.locale-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.locale-tab {
  padding: 0.3rem 0.75rem;
  border: 1px solid #e0e0e0;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #555;
  &.active {
    border-color: #4f46e5;
    background: #ede9fe;
    color: #4f46e5;
    font-weight: 600;
  }
}
.other-locales .locale-row {
  opacity: 0.8;
}
.read-only-translation {
  font-size: 0.875rem;
  color: #555;
  padding: 0.4rem 0.6rem;
  background: #f8f8f8;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  min-height: 2.5rem;
  white-space: pre-wrap;
}

/* AI suggestion styles */
.btn-ai {
  padding: 0.35rem 0.75rem;
  background: #f5f0ff;
  color: #5b21b6;
  border: 1px solid #c4b5fd;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #ede9fe;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ai-suggestion-box {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  background: #f5f0ff;
  border: 1px solid #c4b5fd;
  border-radius: 6px;
  margin-top: 0.4rem;
  flex-wrap: wrap;
}

.ai-suggestion-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #5b21b6;
  flex-shrink: 0;
}

.ai-suggestion-text {
  font-size: 0.875rem;
  color: #1a1a2e;
  flex: 1;
  min-width: 0;
}

.ai-error {
  font-size: 0.78rem;
  color: #c0392b;
  margin-top: 0.25rem;
}
</style>

<style>
/* Global: mention pill rendered via v-html */
.mention {
  display: inline-block;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  font-size: 0.82em;
  font-weight: 600;
}
</style>
