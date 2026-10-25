<template>
  <Teleport defer to="#verba-topbar">
    <NbGrid align="center" class="page-topbar">
      <NbBreadcrumbs title="Nubisco" subtitle="Verba">Page not found</NbBreadcrumbs>
    </NbGrid>
  </Teleport>

  <div class="not-found-view">
    <p class="not-found-code">404</p>
    <h1 class="not-found-title">Page not found</h1>
    <p class="not-found-message">The page you're looking for doesn't exist or has been moved.</p>
    <NbButton variant="secondary" to="/dashboard">Go to dashboard</NbButton>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'NotFoundView' })
</script>

<style lang="scss" scoped>
.not-found-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 4rem 1rem;
  gap: 0.5rem;
}

.not-found-code {
  font-size: 5rem;
  font-weight: 800;
  color: var(--nb-c-surface-hover);
  line-height: 1;
  margin: 0;
}

.not-found-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--nb-c-text);
  margin: 0;
}

.not-found-message {
  font-size: 0.95rem;
  color: var(--nb-c-text-subtle);
  margin: 0.25rem 0 1rem;
}
</style>
