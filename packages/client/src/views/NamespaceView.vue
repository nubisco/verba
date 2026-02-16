<template>
  <div class="container">
    <div v-if="namespace" class="namespace-view">
      <div class="header">
        <h2>{{ namespace.name }}</h2>
        <button @click="showKeyModal = true" class="btn btn-primary">Add Key</button>
      </div>

      <div v-if="keys.length === 0" class="empty-state">
        <p>No translation keys yet. Add your first key!</p>
      </div>

      <div v-else class="keys-list">
        <div v-for="key in keys" :key="key.id" class="card key-card">
          <div class="key-header">
            <div>
              <h4>{{ key.key }}</h4>
              <p v-if="key.description">{{ key.description }}</p>
            </div>
            <button @click="toggleKey(key.id)" class="btn">
              {{ expandedKeys.has(key.id) ? 'Collapse' : 'Expand' }}
            </button>
          </div>

          <div v-if="expandedKeys.has(key.id)" class="translations">
            <div
              v-for="translation in key.translations"
              :key="translation.id"
              class="translation-row"
            >
              <div class="translation-info">
                <strong>{{ translation.locale.name }}</strong>
                <span :class="`badge badge-${translation.state.toLowerCase().replace('_', '-')}`">
                  {{ translation.state }}
                </span>
              </div>
              <div class="translation-value">
                <input
                  v-model="translation.value"
                  @blur="updateTranslation(translation)"
                  type="text"
                />
              </div>
              <div class="translation-actions">
                <select
                  :value="translation.state"
                  @change="updateState(translation, $event)"
                  class="state-select"
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="APPROVED">APPROVED</option>
                </select>
                <button @click="viewComments(translation)" class="btn btn-sm">Comments</button>
              </div>
            </div>

            <div v-if="!hasAllLocales(key)" class="add-translation">
              <select v-model="newTranslation[key.id]" class="locale-select">
                <option value="">Select locale...</option>
                <option
                  v-for="locale in getMissingLocales(key)"
                  :key="locale.id"
                  :value="locale.id"
                >
                  {{ locale.name }}
                </option>
              </select>
              <input
                v-model="newTranslationValue[key.id]"
                type="text"
                placeholder="Translation value"
              />
              <button @click="addTranslation(key.id)" class="btn btn-primary btn-sm">Add</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Key Modal -->
      <div v-if="showKeyModal" class="modal">
        <div class="modal-content">
          <h3>Add Translation Key</h3>
          <form @submit.prevent="createKey">
            <div class="form-group">
              <label>Key (e.g., welcome.message)</label>
              <input v-model="newKey.key" type="text" required />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea v-model="newKey.description" rows="3"></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showKeyModal = false" class="btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Comments Modal -->
      <div v-if="showCommentsModal && selectedTranslation" class="modal">
        <div class="modal-content">
          <h3>Comments</h3>
          <div class="comments-list">
            <div v-for="comment in comments" :key="comment.id" class="comment">
              <div class="comment-header">
                <strong>{{ comment.user.name }}</strong>
                <span class="comment-date">{{ formatDate(comment.createdAt) }}</span>
              </div>
              <p>{{ comment.content }}</p>
            </div>
          </div>
          <form @submit.prevent="addComment">
            <div class="form-group">
              <textarea v-model="newComment" rows="3" placeholder="Add a comment..."></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showCommentsModal = false" class="btn">Close</button>
              <button type="submit" class="btn btn-primary">Add Comment</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  namespaceService,
  keyService,
  translationService,
  commentService,
  localeService,
  type Translation,
  type Locale,
} from '../services/api';

const route = useRoute();
const namespaceId = route.params.id as string;

const namespace = ref<any>(null);
const keys = ref<any[]>([]);
const locales = ref<Locale[]>([]);
const expandedKeys = ref(new Set<string>());

const showKeyModal = ref(false);
const showCommentsModal = ref(false);
const newKey = ref({ key: '', description: '' });

const selectedTranslation = ref<Translation | null>(null);
const comments = ref<any[]>([]);
const newComment = ref('');

const newTranslation = ref<Record<string, string>>({});
const newTranslationValue = ref<Record<string, string>>({});

const loadNamespace = async () => {
  namespace.value = await namespaceService.get(namespaceId);
};

const loadKeys = async () => {
  keys.value = await keyService.list(namespaceId);
};

const loadLocales = async () => {
  if (namespace.value) {
    locales.value = await localeService.list(namespace.value.projectId);
  }
};

const createKey = async () => {
  await keyService.create(namespaceId, newKey.value.key, newKey.value.description);
  showKeyModal.value = false;
  newKey.value = { key: '', description: '' };
  await loadKeys();
};

const toggleKey = (keyId: string) => {
  if (expandedKeys.value.has(keyId)) {
    expandedKeys.value.delete(keyId);
  } else {
    expandedKeys.value.add(keyId);
  }
};

const updateTranslation = async (translation: any) => {
  await translationService.update(translation.id, translation.value);
};

const updateState = async (translation: any, event: any) => {
  const newState = event.target.value;
  await translationService.update(translation.id, undefined, newState);
  translation.state = newState;
};

const addTranslation = async (keyId: string) => {
  const localeId = newTranslation.value[keyId];
  const value = newTranslationValue.value[keyId];
  if (localeId && value) {
    await translationService.create(keyId, localeId, value);
    newTranslation.value[keyId] = '';
    newTranslationValue.value[keyId] = '';
    await loadKeys();
  }
};

const hasAllLocales = (key: any) => {
  return key.translations?.length === locales.value.length;
};

const getMissingLocales = (key: any) => {
  const translatedLocaleIds = new Set(
    key.translations?.map((t: any) => t.locale.id) || []
  );
  return locales.value.filter((locale) => !translatedLocaleIds.has(locale.id));
};

const viewComments = async (translation: any) => {
  selectedTranslation.value = translation;
  comments.value = await commentService.list(translation.id);
  showCommentsModal.value = true;
};

const addComment = async () => {
  if (selectedTranslation.value && newComment.value) {
    await commentService.create(selectedTranslation.value.id, newComment.value);
    comments.value = await commentService.list(selectedTranslation.value.id);
    newComment.value = '';
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

onMounted(async () => {
  await loadNamespace();
  await loadKeys();
  await loadLocales();
});
</script>

<style scoped lang="scss">
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #7f8c8d;
}

.keys-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.key-card {
  .key-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;

    h4 {
      margin-bottom: 0.25rem;
      color: #2c3e50;
    }

    p {
      color: #7f8c8d;
      font-size: 0.9rem;
    }
  }

  .translations {
    border-top: 1px solid #ecf0f1;
    padding-top: 1rem;
  }

  .translation-row {
    display: grid;
    grid-template-columns: 200px 1fr auto;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f8f9fa;

    &:last-child {
      border-bottom: none;
    }

    .translation-info {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .translation-value input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;

      &:focus {
        outline: none;
        border-color: #3498db;
      }
    }

    .translation-actions {
      display: flex;
      gap: 0.5rem;

      .state-select {
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 0.85rem;
      }

      .btn-sm {
        padding: 0.5rem 1rem;
        font-size: 0.85rem;
      }
    }
  }

  .add-translation {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #ecf0f1;

    .locale-select {
      flex: 0 0 200px;
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    input {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
  }
}

.comments-list {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 1rem;

  .comment {
    padding: 1rem;
    border: 1px solid #ecf0f1;
    border-radius: 4px;
    margin-bottom: 0.5rem;

    .comment-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;

      .comment-date {
        font-size: 0.85rem;
        color: #95a5a6;
      }
    }

    p {
      margin: 0;
      color: #2c3e50;
    }
  }
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  .modal-content {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;

    h3 {
      margin-bottom: 1.5rem;
    }

    .modal-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 1.5rem;
    }
  }
}
</style>
