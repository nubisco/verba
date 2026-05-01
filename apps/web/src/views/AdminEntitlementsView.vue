<template>
  <div class="admin-entitlements">
    <h1 class="page-title">Plan &amp; Entitlements</h1>

    <div v-if="store.loading" class="loading">Loading…</div>
    <div v-else-if="store.error" class="error">{{ store.error }}</div>

    <template v-else-if="store.data">
      <!-- Plan summary -->
      <section class="card">
        <h2 class="card-title">Active plan</h2>
        <dl class="definition-list">
          <dt>Plan</dt>
          <dd>
            <span class="badge badge--plan">{{ store.data.plan.name }}</span>
            <span v-if="store.data.hasOverride" class="badge badge--override">override active</span>
          </dd>
          <dt>Plan ID</dt>
          <dd>
            <code>{{ store.data.plan.id }}</code>
          </dd>
          <dt>Mode</dt>
          <dd>{{ store.data.plan.managed ? 'Managed SaaS' : 'Self-hosted' }}</dd>
        </dl>
      </section>

      <!-- Subscription (managed SaaS) -->
      <section v-if="store.data.subscription" class="card">
        <h2 class="card-title">Subscription</h2>
        <dl class="definition-list">
          <dt>Status</dt>
          <dd>
            <span :class="`badge badge--status-${store.data.subscription.status}`">
              {{ store.data.subscription.status }}
            </span>
          </dd>
          <dt>Current period ends</dt>
          <dd>{{ formatDate(store.data.subscription.currentPeriodEnd) }}</dd>
          <dt>Cancel at period end</dt>
          <dd>{{ store.data.subscription.cancelAtPeriodEnd ? 'Yes' : 'No' }}</dd>
        </dl>
      </section>

      <!-- License state (self-hosted EE) -->
      <section v-if="store.data.licenseState.status !== 'none'" class="card">
        <h2 class="card-title">License</h2>
        <dl class="definition-list">
          <dt>Status</dt>
          <dd>
            <span :class="`badge badge--license-${store.data.licenseState.status}`">
              {{ store.data.licenseState.status }}
            </span>
          </dd>
          <dt v-if="store.data.licenseState.licensee">Licensee</dt>
          <dd v-if="store.data.licenseState.licensee">{{ store.data.licenseState.licensee }}</dd>
          <dt v-if="store.data.licenseState.seats">Seats</dt>
          <dd v-if="store.data.licenseState.seats">{{ store.data.licenseState.seats }}</dd>
          <dt>Expires</dt>
          <dd>{{ formatDate(store.data.licenseState.expiresAt) }}</dd>
        </dl>
      </section>

      <!-- Feature entitlements -->
      <section class="card">
        <h2 class="card-title">Feature entitlements</h2>
        <div v-if="store.data.entitlements.features.length === 0" class="empty">
          No EE features enabled on this plan.
        </div>
        <ul v-else class="feature-list">
          <li v-for="f in store.data.entitlements.features" :key="f" class="feature-item">
            <span class="feature-check">✓</span>
            <code>{{ f }}</code>
          </li>
        </ul>
      </section>

      <!-- Resource limits -->
      <section class="card">
        <h2 class="card-title">Resource limits</h2>
        <table class="limits-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Limit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Projects</td>
              <td>{{ limitLabel(store.data.entitlements.maxProjects) }}</td>
            </tr>
            <tr>
              <td>Seats per project</td>
              <td>{{ limitLabel(store.data.entitlements.maxSeatsPerProject) }}</td>
            </tr>
            <tr>
              <td>Keys per project</td>
              <td>{{ limitLabel(store.data.entitlements.maxKeysPerProject) }}</td>
            </tr>
            <tr>
              <td>Locales per project</td>
              <td>{{ limitLabel(store.data.entitlements.maxLocalesPerProject) }}</td>
            </tr>
            <tr>
              <td>Monthly API calls</td>
              <td>{{ limitLabel(store.data.entitlements.maxMonthlyApiCalls) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useEntitlementsStore } from '../stores/entitlements'

const store = useEntitlementsStore()

onMounted(() => {
  store.fetch()
})

function limitLabel(value: number | null): string {
  return value === null ? 'Unlimited' : String(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ': '
  return new Date(value).toLocaleDateString()
}
</script>

<style scoped>
.admin-entitlements {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}

.card {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 1.25rem;
  background: var(--color-surface, #ffffff);
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text-primary, #0f172a);
}

.definition-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.4rem 1rem;
  margin: 0;
  font-size: 0.875rem;
}

.definition-list dt {
  color: var(--color-text-secondary, #64748b);
  font-weight: 500;
}

.definition-list dd {
  margin: 0;
  color: var(--color-text-primary, #0f172a);
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge--plan {
  background: var(--color-primary-100, #dbeafe);
  color: var(--color-primary-800, #1e40af);
}

.badge--override {
  background: var(--color-warning-100, #fef9c3);
  color: var(--color-warning-800, #854d0e);
  margin-left: 0.5rem;
}

.badge--status-active,
.badge--license-valid {
  background: #dcfce7;
  color: #166534;
}

.badge--status-past_due,
.badge--license-grace {
  background: #fef9c3;
  color: #854d0e;
}

.badge--status-canceled,
.badge--license-expired,
.badge--license-invalid {
  background: #fee2e2;
  color: #991b1b;
}

.feature-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
}

.feature-check {
  color: #4acf7b;
  font-weight: 700;
}

.limits-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.limits-table th,
.limits-table td {
  padding: 0.4rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.limits-table th {
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}

.loading,
.error,
.empty {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #64748b);
}

.error {
  color: #dc2626;
}
</style>
