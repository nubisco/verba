<template>
  <div class="container">
    <div v-if="project" class="project-view">
      <div class="header">
        <div>
          <h2>{{ project.name }}</h2>
          <p v-if="project.description">{{ project.description }}</p>
        </div>
        <div class="actions">
          <button @click="showImportModal = true" class="btn btn-primary">Import</button>
          <button @click="exportData" class="btn btn-success">Export</button>
        </div>
      </div>

      <div class="tabs">
        <button
          :class="{ active: activeTab === 'namespaces' }"
          @click="activeTab = 'namespaces'"
        >
          Namespaces
        </button>
        <button :class="{ active: activeTab === 'locales' }" @click="activeTab = 'locales'">
          Locales
        </button>
      </div>

      <!-- Namespaces Tab -->
      <div v-if="activeTab === 'namespaces'" class="tab-content">
        <div class="section-header">
          <h3>Namespaces</h3>
          <button @click="showNamespaceModal = true" class="btn btn-primary">
            Add Namespace
          </button>
        </div>
        <div class="grid">
          <div v-for="namespace in namespaces" :key="namespace.id" class="card">
            <h4>{{ namespace.name }}</h4>
            <p v-if="namespace.description">{{ namespace.description }}</p>
            <p class="meta">{{ namespace._count?.keys || 0 }} keys</p>
            <button @click="openNamespace(namespace.id)" class="btn btn-primary">Open</button>
          </div>
        </div>
      </div>

      <!-- Locales Tab -->
      <div v-if="activeTab === 'locales'" class="tab-content">
        <div class="section-header">
          <h3>Locales</h3>
          <button @click="showLocaleModal = true" class="btn btn-primary">Add Locale</button>
        </div>
        <div class="list">
          <div v-for="locale in locales" :key="locale.id" class="card locale-item">
            <div>
              <strong>{{ locale.name }}</strong>
              <span class="locale-code">{{ locale.code }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Import Modal -->
      <div v-if="showImportModal" class="modal">
        <div class="modal-content">
          <h3>Import Translations</h3>
          <div class="form-group">
            <label>Upload CSV file</label>
            <input type="file" @change="handleFileSelect" accept=".csv" />
          </div>
          <div class="modal-actions">
            <button @click="showImportModal = false" class="btn">Cancel</button>
            <button @click="importFile" class="btn btn-primary" :disabled="!selectedFile">
              Import
            </button>
          </div>
        </div>
      </div>

      <!-- Namespace Modal -->
      <div v-if="showNamespaceModal" class="modal">
        <div class="modal-content">
          <h3>Create Namespace</h3>
          <form @submit.prevent="createNamespace">
            <div class="form-group">
              <label>Name</label>
              <input v-model="newNamespace.name" type="text" required />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea v-model="newNamespace.description" rows="3"></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" @click="showNamespaceModal = false" class="btn">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Locale Modal -->
      <div v-if="showLocaleModal" class="modal">
        <div class="modal-content">
          <h3>Add Locale</h3>
          <form @submit.prevent="createLocale">
            <div class="form-group">
              <label>Code (e.g., en, es, fr)</label>
              <input v-model="newLocale.code" type="text" required />
            </div>
            <div class="form-group">
              <label>Name (e.g., English, Spanish)</label>
              <input v-model="newLocale.name" type="text" required />
            </div>
            <div class="modal-actions">
              <button type="button" @click="showLocaleModal = false" class="btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  projectService,
  namespaceService,
  localeService,
  importExportService,
} from '../services/api';

const route = useRoute();
const router = useRouter();
const projectId = route.params.id as string;

const project = ref<any>(null);
const namespaces = ref<any[]>([]);
const locales = ref<any[]>([]);
const activeTab = ref('namespaces');

const showImportModal = ref(false);
const showNamespaceModal = ref(false);
const showLocaleModal = ref(false);

const selectedFile = ref<File | null>(null);
const newNamespace = ref({ name: '', description: '' });
const newLocale = ref({ code: '', name: '' });

const loadProject = async () => {
  project.value = await projectService.get(projectId);
};

const loadNamespaces = async () => {
  namespaces.value = await namespaceService.list(projectId);
};

const loadLocales = async () => {
  locales.value = await localeService.list(projectId);
};

const createNamespace = async () => {
  await namespaceService.create(projectId, newNamespace.value.name, newNamespace.value.description);
  showNamespaceModal.value = false;
  newNamespace.value = { name: '', description: '' };
  await loadNamespaces();
};

const createLocale = async () => {
  await localeService.create(projectId, newLocale.value.code, newLocale.value.name);
  showLocaleModal.value = false;
  newLocale.value = { code: '', name: '' };
  await loadLocales();
};

const openNamespace = (id: string) => {
  router.push(`/namespaces/${id}`);
};

const handleFileSelect = (event: any) => {
  selectedFile.value = event.target.files[0];
};

const importFile = async () => {
  if (selectedFile.value) {
    await importExportService.import(projectId, selectedFile.value);
    showImportModal.value = false;
    selectedFile.value = null;
    await loadNamespaces();
  }
};

const exportData = async () => {
  const data = await importExportService.export(projectId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.value.name}-export.json`;
  a.click();
};

onMounted(async () => {
  await loadProject();
  await loadNamespaces();
  await loadLocales();
});
</script>

<style scoped lang="scss">
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;

  h2 {
    margin-bottom: 0.5rem;
  }

  p {
    color: #7f8c8d;
  }

  .actions {
    display: flex;
    gap: 1rem;
  }
}

.tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #ecf0f1;

  button {
    padding: 1rem 1.5rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1rem;
    color: #7f8c8d;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;

    &.active {
      color: #3498db;
      border-bottom-color: #3498db;
    }
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.meta {
  font-size: 0.85rem;
  color: #95a5a6;
  margin-bottom: 1rem;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.locale-item {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .locale-code {
    margin-left: 1rem;
    padding: 0.25rem 0.5rem;
    background: #ecf0f1;
    border-radius: 4px;
    font-size: 0.85rem;
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
    max-width: 500px;

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
