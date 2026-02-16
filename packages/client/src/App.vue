<template>
  <div id="app">
    <nav v-if="isAuthenticated" class="navbar">
      <div class="container">
        <h1>Verba</h1>
        <div class="nav-links">
          <router-link to="/projects">Projects</router-link>
          <button @click="logout" class="btn-logout">Logout</button>
        </div>
      </div>
    </nav>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { authService } from './services/api';

const router = useRouter();
const isAuthenticated = computed(() => authService.isAuthenticated());

const logout = () => {
  authService.logout();
  router.push('/login');
};
</script>

<style lang="scss">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #f5f5f5;
}

#app {
  min-height: 100vh;
}

.navbar {
  background: #2c3e50;
  color: white;
  padding: 1rem 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;

    h1 {
      font-size: 1.5rem;
    }

    .nav-links {
      display: flex;
      gap: 1rem;
      align-items: center;

      a {
        color: white;
        text-decoration: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        transition: background 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      }

      .btn-logout {
        background: #e74c3c;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;

        &:hover {
          background: #c0392b;
        }
      }
    }
  }
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;

  &-primary {
    background: #3498db;
    color: white;

    &:hover {
      background: #2980b9;
    }
  }

  &-success {
    background: #27ae60;
    color: white;

    &:hover {
      background: #229954;
    }
  }

  &-danger {
    background: #e74c3c;
    color: white;

    &:hover {
      background: #c0392b;
    }
  }
}

.card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;

    &:focus {
      outline: none;
      border-color: #3498db;
    }
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;

  &-todo {
    background: #95a5a6;
    color: white;
  }

  &-in-progress {
    background: #3498db;
    color: white;
  }

  &-submitted {
    background: #f39c12;
    color: white;
  }

  &-approved {
    background: #27ae60;
    color: white;
  }
}
</style>
