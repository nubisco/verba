<template>
  <div class="members">
    <NbDataTable
      stack-on-phone
      :columns="columns"
      :rows="rows"
      row-key="userId"
      size="sm"
      title="Members"
      description="Who works on this project, and with which role. Readers see it, translators translate, maintainers review and run the project, admins also manage its people. A project's people come from its account."
    >
      <template v-if="store.isAdmin" #toolbar-actions>
        <NbButton variant="primary" icon="plus" @click="adding = true">Add member</NbButton>
      </template>

      <template #cell-person="{ row }">
        <span class="person">
          <NbAvatar :name="row.name ?? undefined" :email="row.email" :picture="row.avatarUrl" size="sm" decorative />
          <span class="person__text">
            <span class="person__name">{{ row.name || row.email }}</span>
            <span v-if="row.name" class="person__email">{{ row.email }}</span>
          </span>
        </span>
      </template>

      <template #cell-role="{ row }">
        <NbSelect
          v-if="store.isAdmin"
          :model-value="row.role"
          :options="roleOptions"
          :aria-label="`Role of ${row.name || row.email}`"
          size="sm"
          @update:model-value="changeRole(row, String($event))"
        />
        <NbBadge v-else size="sm" variant="grey">{{ t(`common.roles.${row.role}`) }}</NbBadge>
      </template>

      <template #cell-locales="{ row }">
        <span v-if="row.localeCodes.length === 0" class="members__all">All locales</span>
        <span v-else class="members__locales">
          <LocaleBadge v-for="code in row.localeCodes" :key="code" :code="code" />
        </span>
      </template>

      <template #cell-actions="{ row }">
        <span class="members__actions">
          <NbButton
            v-if="store.isMaintainer"
            v-nb-tooltip="{ body: t('projects.members.editLocales') }"
            size="sm"
            variant="ghost"
            icon="globe"
            :aria-label="`${t('projects.members.editLocales')}: ${row.name || row.email}`"
            @click="editLocales(row)"
          />
          <NbButton
            v-if="store.isAdmin"
            v-nb-tooltip="{ body: `Remove ${row.name || row.email}` }"
            size="sm"
            variant="ghost"
            icon="user-minus"
            :aria-label="`Remove ${row.name || row.email} from the project`"
            @click="remove(row)"
          />
        </span>
      </template>

      <template #empty>
        <NbEmptyState size="sm" :title="t('projects.members.empty')" />
      </template>
    </NbDataTable>

    <!-- Adding someone: they come from the project's account. -->
    <NbModal close-appearance="button" :open="adding" title="Add member" size="sm" @close="closeAdd">
      <NbForm id="add-project-member" @submit.prevent="add">
        <NbBanner v-if="addError" status="error" variant="inline" :title="addError" />
        <NbTextInput
          id="add-project-member-email"
          v-model="email"
          type="email"
          label="Email"
          :placeholder="t('projects.members.emailPlaceholder')"
          helper="Someone from this project's account. They need to have signed in to Verba once."
          required
        />
        <NbSelect id="add-project-member-role" v-model="role" label="Role" :options="roleOptions" />
      </NbForm>
      <template #footer>
        <NbButton type="button" variant="secondary" @click="closeAdd">Cancel</NbButton>
        <NbButton type="submit" form="add-project-member" variant="primary" :loading="saving" :disabled="!email.trim()">
          Add member
        </NbButton>
      </template>
    </NbModal>

    <!-- Which locales one person translates. None picked means all of them. -->
    <NbModal
      close-appearance="button"
      :open="localesFor !== null"
      :title="t('projects.members.editLocales')"
      size="sm"
      @close="localesFor = null"
    >
      <NbForm id="member-locales" @submit.prevent="saveLocales">
        <LocaleMultiSelect
          id="member-locales-select"
          v-model="localeIds"
          :label="localesFor ? `Locales for ${localesFor.name || localesFor.email}` : ''"
          :options="store.locales"
          value-field="id"
        />
        <p class="members__hint">{{ t('projects.members.leaveUnchecked') }}</p>
      </NbForm>
      <template #footer>
        <NbButton type="button" variant="secondary" @click="localesFor = null">{{ t('common.cancel') }}</NbButton>
        <NbButton type="submit" form="member-locales" variant="primary" :loading="savingLocales">
          {{ t('common.save') }}
        </NbButton>
      </template>
    </NbModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfirm, useToast, type ISelectOption } from '@nubisco/ui'
import { apiFetch } from '../../api'
import { useProjectStore } from '../../stores/project'
import LocaleBadge from '../LocaleBadge.vue'
import LocaleMultiSelect from '../LocaleMultiSelect.vue'

type Row = {
  userId: string
  email: string
  name: string | null
  avatarUrl: string | null
  role: string
  localeIds: string[]
  localeCodes: string[]
}

const props = defineProps<{ projectId: string }>()

const { t } = useI18n()
const store = useProjectStore()
const toast = useToast()
const confirm = useConfirm()

// Managing people is a project admin's, assigning locales a maintainer's (the
// API's ADMIN and MAINTAINER). A column whose every action is out of reach for
// this person goes on every row alike.
const columns = computed(() => [
  { key: 'person', header: 'Person', primary: true },
  { key: 'role', header: 'Role', width: '180px', phoneMeta: true },
  { key: 'locales', header: 'Locales' },
  ...(store.isMaintainer ? [{ key: 'actions', header: '', width: '96px', align: 'right' as const }] : []),
])

const rows = computed<Row[]>(() =>
  store.members.map((m) => {
    const ids = m.assignedLocales ?? []
    return {
      userId: m.userId,
      email: m.user?.email ?? m.userId,
      name: m.user?.name ?? null,
      avatarUrl: m.user?.avatarUrl ?? null,
      role: m.role,
      localeIds: ids,
      localeCodes: ids.map((id) => store.locales.find((l) => l.id === id)?.code ?? id),
    }
  }),
)

const roleOptions = computed<ISelectOption[]>(() =>
  ['READER', 'TRANSLATOR', 'MAINTAINER', 'ADMIN'].map((r) => ({ label: t(`common.roles.${r}`), value: r })),
)

async function changeRole(row: Row, next: string): Promise<void> {
  if (next === row.role) return
  try {
    await apiFetch(`/projects/${props.projectId}/members/${row.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: next }),
    })
    const m = store.members.find((x) => x.userId === row.userId)
    if (m) m.role = next
    toast.success(`${row.name || row.email} is now ${t(`common.roles.${next}`).toLowerCase()}`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not change the role')
  }
}

async function remove(row: Row): Promise<void> {
  const done = await confirm({
    title: 'Remove member',
    subjectLabel: 'Member',
    subject: row.email,
    message: 'They lose access to this project. They stay in its account.',
    confirmLabel: 'Remove member',
    onConfirm: async () => {
      await apiFetch(`/projects/${props.projectId}/members/${row.userId}`, { method: 'DELETE' })
    },
  })
  if (done) store.members = store.members.filter((m) => m.userId !== row.userId)
}

// ── Adding someone ─────────────────────────────────────────────────────────
const adding = ref(false)
const email = ref('')
const role = ref('TRANSLATOR')
const saving = ref(false)
const addError = ref('')

function closeAdd(): void {
  adding.value = false
  email.value = ''
  role.value = 'TRANSLATOR'
  addError.value = ''
}

async function add(): Promise<void> {
  saving.value = true
  addError.value = ''
  try {
    // The server resolves the address, so nothing here searches other accounts.
    await apiFetch(`/projects/${props.projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: email.value.trim(), role: role.value }),
    })
    await store.reloadMembers()
    toast.success(`${email.value.trim()} added`)
    closeAdd()
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Could not add them'
  } finally {
    saving.value = false
  }
}

// ── Locales one person translates ─────────────────────────────────────────
const localesFor = ref<Row | null>(null)
const localeIds = ref<string[]>([])
const savingLocales = ref(false)

function editLocales(row: Row): void {
  localesFor.value = row
  localeIds.value = [...row.localeIds]
}

async function saveLocales(): Promise<void> {
  const row = localesFor.value
  if (!row) return
  savingLocales.value = true
  try {
    await apiFetch(`/projects/${props.projectId}/members/${row.userId}/locales`, {
      method: 'PUT',
      body: JSON.stringify({ localeIds: localeIds.value }),
    })
    const m = store.members.find((x) => x.userId === row.userId)
    if (m) m.assignedLocales = [...localeIds.value]
    localesFor.value = null
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save the locales')
  } finally {
    savingLocales.value = false
  }
}
</script>

<style scoped lang="scss">
.members {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);

  &__all {
    color: var(--nb-c-text-subtle);
  }

  &__locales {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--nb-spacing-8);
  }

  &__actions {
    display: inline-flex;
    gap: var(--nb-spacing-4);
  }

  &__hint {
    margin: 0;
    color: var(--nb-c-text-subtle);
    font-size: var(--nb-type-body-sm-size);
  }
}

.person {
  display: inline-flex;
  align-items: center;
  gap: var(--nb-spacing-8);
  min-width: 0;

  &__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__email {
    color: var(--nb-c-text-subtle);
    font-size: var(--nb-type-body-sm-size);
  }
}
</style>
