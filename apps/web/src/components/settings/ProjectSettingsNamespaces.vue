<template>
  <div class="namespaces">
    <NbDataTable
      stack-on-phone
      :columns="columns"
      :rows="store.namespaces"
      row-key="id"
      size="sm"
      title="Namespaces"
      description="Groups of keys, usually one per file or feature. Every key belongs to one, and removing a namespace deletes its keys."
    >
      <template v-if="store.isMaintainer" #toolbar-actions>
        <NbButton variant="primary" icon="plus" @click="adding = true">Add namespace</NbButton>
      </template>

      <template #cell-slug="{ row }">
        <code class="namespaces__slug">{{ row.slug }}</code>
      </template>
      <template #cell-keys="{ row }">{{ row._count?.keys ?? 0 }}</template>
      <template #cell-actions="{ row }">
        <NbButton
          v-nb-tooltip="{ body: 'Remove namespace' }"
          size="sm"
          variant="ghost"
          icon="trash"
          :aria-label="`Remove namespace ${row.slug}`"
          @click="remove(row)"
        />
      </template>

      <template #empty>
        <NbEmptyState
          size="sm"
          title="No namespaces yet"
          :description="
            store.isMaintainer
              ? 'Add one before the first key, or import a file and Verba creates them.'
              : 'A maintainer adds them, or they come with the first import.'
          "
        />
      </template>
    </NbDataTable>

    <NbModal close-appearance="button" :open="adding" title="Add namespace" size="sm" @close="close">
      <NbForm id="add-namespace" @submit.prevent="add">
        <NbBanner v-if="error" status="error" variant="inline" :title="error" />
        <NbTextInput
          id="add-namespace-name"
          v-model="name"
          label="Name"
          :placeholder="t('projects.namespaces.namePlaceholder')"
          :helper="slug ? `Keys in it are named ${slug}.something` : 'Its slug is made from the name.'"
          required
        />
      </NbForm>
      <template #footer>
        <NbButton type="button" variant="secondary" @click="close">Cancel</NbButton>
        <NbButton type="submit" form="add-namespace" variant="primary" :loading="saving" :disabled="!slug">
          Add namespace
        </NbButton>
      </template>
    </NbModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm, useToast } from '@nubisco/ui'
import { apiFetch } from '../../api'
import { useProjectStore, type Namespace } from '../../stores/project'

const props = defineProps<{ projectId: string }>()

const { t } = useI18n()
const store = useProjectStore()
const toast = useToast()
const confirm = useConfirm()

const columns = computed(() => [
  { key: 'slug', header: 'Slug', width: '200px', primary: true },
  { key: 'name', header: 'Name' },
  { key: 'keys', header: 'Keys', width: '100px', align: 'right' as const, phoneMeta: true },
  ...(store.isMaintainer ? [{ key: 'actions', header: '', width: '64px', align: 'right' as const }] : []),
])

const adding = ref(false)
const name = ref('')
const saving = ref(false)
const error = ref('')

const slug = computed(() =>
  name.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
)

function close(): void {
  adding.value = false
  name.value = ''
  error.value = ''
}

async function add(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const ns = await apiFetch<Namespace>(`/projects/${props.projectId}/namespaces`, {
      method: 'POST',
      body: JSON.stringify({ name: name.value.trim(), slug: slug.value }),
    })
    store.namespaces.push(ns)
    toast.success(`${ns.slug} added`)
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not add the namespace'
  } finally {
    saving.value = false
  }
}

async function remove(ns: Namespace): Promise<void> {
  const keys = ns._count?.keys ?? 0
  const done = await confirm({
    title: 'Remove namespace',
    subjectLabel: 'Namespace',
    subject: ns.slug,
    message:
      keys > 0
        ? `Its ${keys} ${keys === 1 ? 'key is' : 'keys are'} deleted with it, and their translations.`
        : 'It has no keys.',
    confirmLabel: 'Remove namespace',
    onConfirm: async () => {
      await apiFetch(`/projects/${props.projectId}/namespaces/${ns.id}`, { method: 'DELETE' })
    },
  })
  if (done) store.namespaces = store.namespaces.filter((n) => n.id !== ns.id)
}
</script>

<style scoped lang="scss">
.namespaces {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);

  &__slug {
    font-family: var(--nb-font-family-mono, monospace);
  }
}
</style>
