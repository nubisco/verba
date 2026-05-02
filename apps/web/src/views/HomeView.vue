<template>
  <section class="home">
    <h1>Nubisco Verba</h1>
    <p class="tagline">Self-hostable i18n collaboration.</p>
    <div class="api-status" :class="apiStatus">
      API: <strong>{{ apiStatus }}</strong>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const apiStatus = ref<'checking' | 'ok' | 'error'>('checking')

onMounted(async () => {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000')}/health`,
    )
    const data = await res.json()
    apiStatus.value = data.status === 'ok' ? 'ok' : 'error'
  } catch {
    apiStatus.value = 'error'
  }
})
</script>

<style lang="scss" scoped>
.home {
  padding: 2rem;

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .tagline {
    color: #666;
    margin-bottom: 1.5rem;
  }

  .api-status {
    display: inline-block;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    font-size: 0.9rem;

    &.checking {
      background: #f0f0f0;
      color: #555;
    }
    &.ok {
      background: #d4edda;
      color: #155724;
    }
    &.error {
      background: #f8d7da;
      color: #721c24;
    }
  }
}
</style>
