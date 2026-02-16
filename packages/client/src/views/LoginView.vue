<template>
  <div class="container">
    <div class="auth-container">
      <div class="card">
        <h2>{{ isLogin ? 'Login' : 'Register' }}</h2>
        <form @submit.prevent="handleSubmit">
          <div v-if="!isLogin" class="form-group">
            <label>Name</label>
            <input v-model="form.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input v-model="form.email" type="email" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input v-model="form.password" type="password" required />
          </div>
          <div v-if="error" class="error">{{ error }}</div>
          <button type="submit" class="btn btn-primary">
            {{ isLogin ? 'Login' : 'Register' }}
          </button>
        </form>
        <p class="toggle-text">
          {{ isLogin ? "Don't have an account?" : 'Already have an account?' }}
          <a @click="isLogin = !isLogin">{{ isLogin ? 'Register' : 'Login' }}</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authService } from '../services/api';

const router = useRouter();
const isLogin = ref(true);
const form = ref({ email: '', password: '', name: '' });
const error = ref('');

const handleSubmit = async () => {
  try {
    error.value = '';
    if (isLogin.value) {
      await authService.login(form.value.email, form.value.password);
    } else {
      await authService.register(form.value.email, form.value.name, form.value.password);
    }
    router.push('/projects');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'An error occurred';
  }
};
</script>

<style scoped lang="scss">
.auth-container {
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;

  .card {
    width: 100%;
    max-width: 400px;
  }

  h2 {
    margin-bottom: 1.5rem;
    text-align: center;
  }

  button {
    width: 100%;
    margin-top: 1rem;
  }

  .error {
    color: #e74c3c;
    margin-top: 0.5rem;
    font-size: 0.9rem;
  }

  .toggle-text {
    text-align: center;
    margin-top: 1rem;

    a {
      color: #3498db;
      cursor: pointer;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
