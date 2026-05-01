<template>
  <div class="setup-page">
    <div class="setup-card">
      <div class="setup-logo">
        <img :src="logoSrc" alt="Verba" />
      </div>

      <!-- Step: Welcome -->
      <template v-if="step === 'welcome'">
        <h1>Welcome to Verba</h1>
        <p class="setup-subtitle">
          Let's get your instance set up. This wizard runs once: on first launch when no users exist.
        </p>
        <ul class="setup-checklist">
          <li>✅ Create your admin account</li>
          <li>✅ Start managing translation keys</li>
          <li>✅ Invite your team</li>
        </ul>
        <NbButton variant="primary" class="setup-btn" @click="step = 'account'">Get started →</NbButton>
      </template>

      <!-- Step: Account -->
      <template v-else-if="step === 'account'">
        <h1>Create your admin account</h1>
        <p class="setup-subtitle">This will be the first user and full administrator.</p>
        <form class="setup-form" @submit.prevent="submit">
          <div class="field">
            <label for="email">Email</label>
            <NbTextInput
              id="email"
              v-model="adminEmail"
              type="email"
              required
              autocomplete="email"
              placeholder="admin@example.com"
            />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <NbTextInput
              id="password"
              v-model="adminPassword"
              type="password"
              required
              autocomplete="new-password"
              placeholder="Min. 8 characters"
              :min="8"
            />
          </div>
          <p v-if="error" class="setup-error">{{ error }}</p>
          <NbButton type="submit" variant="primary" class="setup-btn" :disabled="loading">
            {{ loading ? 'Setting up…' : 'Create account & finish' }}
          </NbButton>
        </form>
      </template>

      <!-- Step: Done -->
      <template v-else>
        <div class="setup-done">
          <div class="setup-done-icon">🎉</div>
          <h1>You're all set!</h1>
          <p class="setup-subtitle">Your Verba instance is ready. You're logged in as the admin.</p>
          <NbButton variant="primary" class="setup-btn" @click="finish">Go to dashboard →</NbButton>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { apiFetch } from '../api'

const router = useRouter()
const auth = useAuthStore()
const logoSrc = `${import.meta.env.BASE_URL}logo.svg`

const step = ref<'welcome' | 'account' | 'done'>('welcome')
const adminEmail = ref('')
const adminPassword = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await apiFetch('/setup', {
      method: 'POST',
      body: JSON.stringify({
        adminEmail: adminEmail.value,
        adminPassword: adminPassword.value,
      }),
    })
    await auth.fetchMe()
    step.value = 'done'
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Setup failed'
  } finally {
    loading.value = false
  }
}

function finish() {
  router.replace('/dashboard')
}
</script>

<style lang="scss" scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f6fa;
}

.setup-card {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  padding: 2.5rem 2.25rem;
  width: 100%;
  max-width: 420px;
  text-align: center;

  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    color: #1a1a2e;
  }
}

.setup-logo {
  margin-bottom: 1.5rem;

  img {
    height: 48px;
    width: auto;
  }
}

.setup-subtitle {
  color: #6b7280;
  font-size: 0.9rem;
  margin: 0 0 1.5rem;
  line-height: 1.5;
}

.setup-checklist {
  list-style: none;
  padding: 0;
  margin: 0 0 1.75rem;
  text-align: left;

  li {
    padding: 0.35rem 0;
    font-size: 0.9rem;
    color: #374151;
  }
}

.setup-form {
  text-align: left;

  .field {
    margin-bottom: 1rem;

    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.3rem;
    }
  }
}

.setup-error {
  color: #dc2626;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.setup-btn {
  width: 100%;
  padding: 0.65rem;
  font-size: 0.95rem;
  margin-top: 0.5rem;
}

.setup-done {
  &-icon {
    font-size: 3rem;
    margin-bottom: 0.75rem;
  }
}
</style>
