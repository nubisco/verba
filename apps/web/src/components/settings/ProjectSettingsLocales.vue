<template>
  <div class="locales">
    <NbDataTable
      stack-on-phone
      :columns="columns"
      :rows="store.locales"
      row-key="id"
      size="sm"
      title="Locales"
      description="The languages this project is translated into. Removing one deletes its translations."
    >
      <template v-if="store.isMaintainer" #toolbar-actions>
        <NbButton variant="primary" icon="plus" @click="adding = true">Add locale</NbButton>
      </template>

      <template #cell-code="{ row }">
        <LocaleBadge :code="row.code" />
      </template>
      <template #cell-state="{ row }">
        <NbBadge size="sm" :variant="row.isEnabled ? 'green' : 'grey'">
          {{ row.isEnabled ? 'Enabled' : 'Disabled' }}
        </NbBadge>
      </template>
      <template #cell-actions="{ row }">
        <NbButton
          v-nb-tooltip="{ body: 'Remove locale' }"
          size="sm"
          variant="ghost"
          icon="trash"
          :aria-label="`Remove locale ${row.code}`"
          @click="remove(row)"
        />
      </template>

      <template #empty>
        <NbEmptyState
          size="sm"
          title="No locales yet"
          :description="
            store.isMaintainer
              ? 'Add the languages this project is translated into.'
              : 'A maintainer adds the languages this project is translated into.'
          "
        />
      </template>
    </NbDataTable>

    <NbModal close-appearance="button" :open="adding" title="Add locale" size="sm" @close="close">
      <NbForm id="add-locale" @submit.prevent="add">
        <NbBanner v-if="error" status="error" variant="inline" :title="error" />
        <LocaleSelect
          id="add-locale-known"
          v-model="known"
          label="Language"
          :options="KNOWN_LOCALES"
          placeholder="Pick a language"
          @update:model-value="fillFromKnown"
        />
        <NbTextInput
          id="add-locale-code"
          v-model="code"
          label="Code"
          placeholder="en, pt_PT"
          helper="Pick a language above, or type any code your files use."
          required
        />
        <NbTextInput id="add-locale-name" v-model="name" label="Name" placeholder="English" required />
      </NbForm>
      <template #footer>
        <NbButton type="button" variant="secondary" @click="close">Cancel</NbButton>
        <NbButton
          type="submit"
          form="add-locale"
          variant="primary"
          :loading="saving"
          :disabled="!code.trim() || !name.trim()"
        >
          Add locale
        </NbButton>
      </template>
    </NbModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfirm, useToast } from '@nubisco/ui'
import { apiFetch } from '../../api'
import { useProjectStore, type Locale } from '../../stores/project'
import LocaleBadge from '../LocaleBadge.vue'
import LocaleSelect from '../LocaleSelect.vue'
import { KNOWN_LOCALES } from '../../utils/localeUtils'

const props = defineProps<{ projectId: string }>()

const store = useProjectStore()
const toast = useToast()
const confirm = useConfirm()

// Adding and removing is a maintainer's (the API's MAINTAINER), so for
// anybody else the remove column goes on every row alike.
const columns = computed(() => [
  { key: 'code', header: 'Code', width: '160px', primary: true },
  { key: 'name', header: 'Name' },
  { key: 'state', header: 'State', width: '120px', phoneMeta: true },
  ...(store.isMaintainer ? [{ key: 'actions', header: '', width: '64px', align: 'right' as const }] : []),
])

const adding = ref(false)
const known = ref('')
const code = ref('')
const name = ref('')
const saving = ref(false)
const error = ref('')

function fillFromKnown(value: string): void {
  const found = KNOWN_LOCALES.find((l) => l.code === value)
  if (!found) return
  code.value = found.code
  name.value = found.name
}

function close(): void {
  adding.value = false
  known.value = ''
  code.value = ''
  name.value = ''
  error.value = ''
}

async function add(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const locale = await apiFetch<Locale>(`/projects/${props.projectId}/locales`, {
      method: 'POST',
      body: JSON.stringify({ code: code.value.trim(), name: name.value.trim() }),
    })
    store.locales.push(locale)
    store.localeProgress.push({
      id: locale.id,
      code: locale.code,
      name: locale.name,
      approved: 0,
      total: store.totalKeys,
    })
    toast.success(`${locale.code} added`)
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not add the locale'
  } finally {
    saving.value = false
  }
}

async function remove(locale: Locale): Promise<void> {
  const done = await confirm({
    title: 'Remove locale',
    subjectLabel: 'Locale',
    subject: `${locale.code} (${locale.name})`,
    message: 'Every translation into it is deleted.',
    confirmLabel: 'Remove locale',
    onConfirm: async () => {
      await apiFetch(`/projects/${props.projectId}/locales/${locale.id}`, { method: 'DELETE' })
    },
  })
  if (!done) return
  store.locales = store.locales.filter((l) => l.id !== locale.id)
  store.localeProgress = store.localeProgress.filter((l) => l.id !== locale.id)
}
</script>

<style scoped lang="scss">
.locales {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
}
</style>
