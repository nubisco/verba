<template>
  <div class="container">
    <div class="header">
      <h2>Projects</h2>
      <button @click="showCreateModal = true" class="btn btn-primary">Create Project</button>
    </div>

    <div v-if="projects.length === 0" class="empty-state">
      <p>No projects yet. Create your first project!</p>
    </div>

    <div v-else class="grid">
      <div v-for="project in projects" :key="project.id" class="card project-card">
        <h3>{{ project.name }}</h3>
        <p v-if="project.description">{{ project.description }}</p>
        <div class="project-meta">
          <span>{{ project._count?.namespaces || 0 }} namespaces</span>
          <span>{{ project._count?.locales || 0 }} locales</span>
        </div>
        <button @click="openProject(project.id)" class="btn btn-primary">Open</button>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="modal">
      <div class="modal-content">
        <h3>Create Project</h3>
        <form @submit.prevent="createProject">
          <div class="form-group">
            <label>Name</label>
            <input v-model="newProject.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="newProject.description" rows="3"></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" @click="showCreateModal = false" class="btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { projectService, type Project } from '../services/api';

const router = useRouter();
const projects = ref<any[]>([]);
const showCreateModal = ref(false);
const newProject = ref({ name: '', description: '' });

const loadProjects = async () => {
  projects.value = await projectService.list();
};

const createProject = async () => {
  await projectService.create(newProject.value.name, newProject.value.description);
  showCreateModal.value = false;
  newProject.value = { name: '', description: '' };
  await loadProjects();
};

const openProject = (id: string) => {
  router.push(`/projects/${id}`);
};

onMounted(loadProjects);
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

.project-card {
  h3 {
    margin-bottom: 0.5rem;
    color: #2c3e50;
  }

  p {
    color: #7f8c8d;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .project-meta {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    font-size: 0.85rem;
    color: #95a5a6;
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
