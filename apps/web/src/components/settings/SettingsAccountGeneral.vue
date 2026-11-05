<template>
  <div class="general">
    <NbPanel class="general__section">
      <header class="general__head">
        <div>
          <h2 class="type-heading-01">Account</h2>
          <p class="general__lede">
            The account holds the projects and the people who work on them. Its name is what everyone in it sees on Home
            and in the trail.
          </p>
        </div>
      </header>

      <NbDefinitionList :items="details" />

      <form v-if="accountsStore.canManage" class="general__form" @submit.prevent="save">
        <NbTextInput id="account-name" v-model="name" label="Name" :maxlength="100" required :error="nameError" />
        <div class="general__actions">
          <NbButton type="submit" variant="primary" :loading="saving" :disabled="!dirty || !name.trim()">
            Save
          </NbButton>
        </div>
      </form>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useToast } from '@nubisco/ui'
import { apiFetch } from '../../api'
import { useAccountsStore, type AccountSummary } from '../../stores/accounts'
import { accountRoleLabel } from './roles'

const props = defineProps<{ account: AccountSummary }>()

const accountsStore = useAccountsStore()
const toast = useToast()

const name = ref(props.account.name)
const nameError = ref('')
const saving = ref(false)
const dirty = computed(() => name.value.trim() !== props.account.name)

watch(
  () => props.account,
  (account) => {
    name.value = account.name
    nameError.value = ''
  },
)

const details = computed(() => [
  { term: 'Slug', value: props.account.slug },
  { term: 'Your role', value: accountRoleLabel(props.account.role) },
  { term: 'Projects', value: props.account.projectCount },
])

async function save(): Promise<void> {
  saving.value = true
  nameError.value = ''
  try {
    await apiFetch(`/accounts/${props.account.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.value.trim() }),
    })
    await accountsStore.load()
    toast.success('Saved')
  } catch (e) {
    nameError.value = e instanceof Error ? e.message : 'Could not rename the account'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.general {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);

  &__section {
    display: flex;
    flex-direction: column;
    gap: var(--nb-spacing-16);
  }

  &__lede {
    max-width: 68ch;
    margin: var(--nb-spacing-4) 0 0;
    color: var(--nb-c-text-subtle);
    font-size: var(--nb-type-body-sm-size);
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--nb-spacing-16);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}
</style>
