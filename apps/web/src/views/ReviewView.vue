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

    <div v-else-if="items.length === 0" class="empty-state">
      <div class="empty-icon">✅</div>
      <p>{{ t('review.empty') }}</p>
    </div>

    <div v-else class="review-list">
      <div v-for="item in items" :key="item.id" class="review-card">
        <div class="review-meta">
          <span class="locale-badge">{{ item.locale?.code ?? item.localeId }}</span>
          <RouterLink :to="`/keys/${projectId}/${item.key?.id ?? item.keyId}`" class="key-link">
            {{ item.key?.fullKey ?? item.key?.name ?? item.keyId }}
          </RouterLink>
          <span v-if="item.assignedTo" class="assignee-badge">
            👤 {{ item.assignedTo.name?.trim() || item.assignedTo.email }}
          </span>
        </div>

        <div class="translation-text">{{ item.text || '(empty)' }}</div>

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
      </div>
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

.breadcrumb {
  font-size: 0.85rem;
  color: var(--nb-c-text);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.review-card {
  background: var(--nb-c-layer-1);
  border: 1px solid var(--nb-c-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
}

.review-meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}

.locale-badge {
  font-size: 0.75rem;
  background: color-mix(in srgb, var(--nb-c-primary) 12%, transparent);
  color: var(--nb-c-primary);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 700;
}

.assignee-badge {
  font-size: 0.75rem;
  background: var(--nb-c-success-surface);
  color: var(--nb-c-on-success-surface);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.key-link {
  font-family: var(--nb-font-family-mono);
  font-size: 0.85rem;
  color: var(--nb-c-text);
  text-decoration: none;
  font-weight: 600;
  &:hover {
    text-decoration: underline;
  }
}

.translation-text {
  font-size: 0.95rem;
  color: var(--nb-c-text);
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--nb-c-layer-2);
  border-radius: 4px;
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

.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--nb-c-text-subtle);
  background: var(--nb-c-layer-1);
  border-radius: 8px;
  border: 1px dashed var(--nb-c-border);
  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }
  p {
    margin: 0;
    font-size: 0.95rem;
  }
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
