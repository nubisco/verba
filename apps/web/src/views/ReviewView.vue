<template>
  <!-- Topbar -->
  <Teleport defer to="#verba-topbar">
    <NbButton variant="secondary" outlined @click="load">
      {{ t('review.refresh') }}
    </NbButton>
  </Teleport>

  <div>
    <div v-if="loading" class="skeleton-list">
      <NbSkeleton v-for="n in 5" :key="n" variant="block" :height="110" radius="md" />
    </div>

    <NbEmptyState v-else-if="items.length === 0" icon="check-circle" :title="t('review.empty')" bordered />

    <div v-else class="review-list">
      <NbPanel v-for="item in items" :key="item.id" class="review-card">
        <div class="review-meta">
          <NbBadge variant="primary">{{ item.locale?.code ?? item.localeId }}</NbBadge>
          <NbButton variant="link" class="key-link" :to="`/keys/${projectId}/${item.key?.id ?? item.keyId}`">
            {{ item.key?.fullKey ?? item.key?.name ?? item.keyId }}
          </NbButton>
          <NbBadge v-if="item.assignedTo" variant="green" icon="user">
            {{ item.assignedTo.name?.trim() || item.assignedTo.email }}
          </NbBadge>
        </div>

        <!-- A panel in the review card's panel: one layer deeper than the card. -->
        <NbPanel class="translation-text">{{ item.text || '(empty)' }}</NbPanel>

        <!-- Reviewer comment (optional, shown when expanded) -->
        <div v-if="showCommentFor === item.id" class="review-comment-area">
          <NbTextInput
            :model-value="reviewComment.get(item.id) ?? ''"
            :placeholder="t('review.commentPlaceholder')"
            multiline
            :rows="2"
            @update:model-value="reviewComment.set(item.id, $event)"
          />
        </div>

        <div class="review-actions">
          <NbButton
            variant="success"
            size="sm"
            :disabled="approving.has(item.id)"
            :loading="approving.has(item.id)"
            @click="approve(item)"
          >
            {{ t('review.approve') }}
          </NbButton>
          <NbButton
            variant="danger"
            size="sm"
            :disabled="rejecting.has(item.id)"
            :loading="rejecting.has(item.id)"
            @click="reject(item)"
          >
            {{ t('review.reject') }}
          </NbButton>
          <NbButton
            :variant="showCommentFor === item.id ? 'secondary' : 'ghost'"
            :outlined="showCommentFor === item.id"
            :title="t('review.addComment')"
            @click="toggleComment(item.id)"
          >
            💬
            {{ showCommentFor === item.id ? t('common.cancel') : t('review.addComment') }}
          </NbButton>
        </div>
      </NbPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { apiFetch } from '../api'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const projectId = route.params.id as string
const { t } = useI18n()

interface Translation {
  id: string
  text: string
  status: string
  localeId: string
  keyId: string
  key: { id: string; name: string; fullKey?: string; namespaceId: string }
  locale: { code: string }
  assignedTo?: { id: string; name?: string; email: string } | null
}

const loading = ref(true)
const items = ref<Translation[]>([])
const approving = ref<Set<string>>(new Set())
const rejecting = ref<Set<string>>(new Set())

// Per-item review comment (shown when about to approve/reject)
const reviewComment = ref<Map<string, string>>(new Map())
const showCommentFor = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const result = await apiFetch<Translation[]>(`/projects/${projectId}/translations?status=SUBMITTED&limit=100`)
    items.value = Array.isArray(result) ? result : ((result as { items?: Translation[] }).items ?? [])
  } finally {
    loading.value = false
  }
}

async function postReviewComment(translationId: string) {
  const text = reviewComment.value.get(translationId)?.trim()
  if (!text) return
  try {
    await apiFetch(`/projects/${projectId}/translations/${translationId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  } catch {
    /* non-critical */
  }
}

async function approve(item: Translation) {
  approving.value = new Set(approving.value).add(item.id)
  try {
    await postReviewComment(item.id)
    await apiFetch(`/projects/${projectId}/translations/${item.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'APPROVED' }),
    })
    items.value = items.value.filter((x) => x.id !== item.id)
    showCommentFor.value = null
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to approve')
  } finally {
    const s = new Set(approving.value)
    s.delete(item.id)
    approving.value = s
  }
}

async function reject(item: Translation) {
  rejecting.value = new Set(rejecting.value).add(item.id)
  try {
    await postReviewComment(item.id)
    await apiFetch(`/projects/${projectId}/translations/${item.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    })
    items.value = items.value.filter((x) => x.id !== item.id)
    showCommentFor.value = null
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Failed to reject')
  } finally {
    const s = new Set(rejecting.value)
    s.delete(item.id)
    rejecting.value = s
  }
}

function toggleComment(itemId: string) {
  showCommentFor.value = showCommentFor.value === itemId ? null : itemId
  if (!reviewComment.value.has(itemId)) reviewComment.value.set(itemId, '')
}

onMounted(load)
</script>

<style lang="scss" scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;

  h2 {
    margin: 0.25rem 0 0.2rem;
    font-size: 1.4rem;
  }
  .subtitle {
    margin: 0;
    color: var(--nb-c-text-subtle);
    font-size: 0.875rem;
  }
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.review-card {
  padding: 1rem 1.25rem;
}

.review-meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}

// NbButton's link variant underlines on hover and focus. The key keeps the
// text colour and the mono face every key in Verba is set in.
.key-link {
  --nb-button-link-color: currentColor;
  font-family: var(--nb-font-family-mono);
  font-size: 0.85rem;
  font-weight: 600;
}

.translation-text {
  font-size: 0.95rem;
  color: var(--nb-c-text);
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  min-height: 2rem;
  white-space: pre-wrap;
}

.review-comment-area {
  margin-bottom: 0.75rem;
}

.review-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
