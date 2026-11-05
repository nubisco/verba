<template>
  <div class="members">
    <NbDataTable
      stack-on-phone
      :columns="columns"
      :rows="members"
      row-key="userId"
      size="sm"
      :loading="loading"
      title="Members"
      description="Members work in the account's projects they are added to. Admins add and remove people. Owners also manage other owners, and an account always keeps one."
    >
      <template v-if="accountsStore.canManage" #toolbar-actions>
        <NbButton variant="primary" icon="plus" @click="adding = true">Add member</NbButton>
      </template>

      <template #cell-person="{ row }">
        <span class="person">
          <NbAvatar :name="row.name" :email="row.email" :picture="row.avatarUrl" size="sm" decorative />
          <span class="person__text">
            <span class="person__name">{{ row.name || row.email }}</span>
            <span v-if="row.name" class="person__email">{{ row.email }}</span>
          </span>
        </span>
      </template>

      <template #cell-role="{ row }">
        <NbSelect
          v-if="canChangeRole(row)"
          :model-value="row.role"
          :options="accountRoleOptions(account.role)"
          :aria-label="`Role of ${row.name || row.email}`"
          size="sm"
          @update:model-value="changeRole(row, String($event))"
        />
        <NbBadge v-else size="sm" :variant="accountRoleBadge(row.role)">{{ accountRoleLabel(row.role) }}</NbBadge>
      </template>

      <!-- One icon per row, the same slot on every row: Leave on your own
           row, Remove on everyone else's, disabled with the reason where it
           does not apply. The server decides either way. -->
      <template #cell-actions="{ row }">
        <NbButton
          v-if="row.userId === auth.user?.id"
          v-nb-tooltip="{ body: 'Leave this account' }"
          size="sm"
          variant="ghost"
          icon="sign-out"
          :aria-label="`Leave ${account.name}`"
          @click="remove(row)"
        />
        <NbButton
          v-else
          v-nb-tooltip="{ body: removeReason(row) ?? `Remove ${row.name || row.email}` }"
          size="sm"
          variant="ghost"
          icon="user-minus"
          :disabled="removeReason(row) !== null"
          :aria-label="`Remove ${row.name || row.email} from ${account.name}`"
          @click="remove(row)"
        />
      </template>

      <template #empty>
        <NbEmptyState
          size="sm"
          title="Nobody here yet"
          description="Add the first member. They need to have signed in to Verba once."
        />
      </template>
    </NbDataTable>

    <NbModal close-appearance="button" :open="adding" title="Add member" size="sm" @close="closeAdd">
      <NbForm id="add-account-member" @submit.prevent="add">
        <NbBanner v-if="addError" status="error" variant="inline" :title="addError" />
        <NbTextInput
          id="add-account-member-email"
          v-model="email"
          type="email"
          label="Email"
          placeholder="name@example.com"
          helper="They need to have signed in to Verba once."
          required
        />
        <NbSelect
          id="add-account-member-role"
          v-model="role"
          label="Role"
          :options="accountRoleOptions(account.role)"
        />
      </NbForm>
      <template #footer>
        <NbButton type="button" variant="secondary" @click="closeAdd">Cancel</NbButton>
        <NbButton type="submit" form="add-account-member" variant="primary" :loading="saving" :disabled="!email.trim()">
          Add member
        </NbButton>
      </template>
    </NbModal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm, useToast } from '@nubisco/ui'
import { apiFetch } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { useAccountsStore, type AccountRole, type AccountSummary } from '../../stores/accounts'
import { accountRoleBadge, accountRoleLabel, accountRoleOptions } from './roles'

interface AccountMember {
  userId: string
  role: AccountRole
  email: string
  name: string | null
  avatarUrl: string | null
  deactivated: boolean
}

const props = defineProps<{ account: AccountSummary }>()

const router = useRouter()
const auth = useAuthStore()
const accountsStore = useAccountsStore()
const toast = useToast()
const confirm = useConfirm()

const columns = [
  { key: 'person', header: 'Person', primary: true },
  { key: 'role', header: 'Role', width: '180px', phoneMeta: true },
  { key: 'actions', header: '', width: '64px', align: 'right' as const },
]

const members = ref<AccountMember[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    members.value = await apiFetch<AccountMember[]>(`/accounts/${props.account.id}/members`)
  } catch (e) {
    members.value = []
    toast.error(e instanceof Error ? e.message : 'Could not load the members')
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => props.account.id, load)

function canChangeRole(m: AccountMember): boolean {
  if (!accountsStore.canManage || m.userId === auth.user?.id) return false
  return m.role !== 'OWNER' || props.account.role === 'OWNER'
}

/** Why this person cannot be removed by the one looking, or null when they can. */
function removeReason(m: AccountMember): string | null {
  if (!accountsStore.canManage) return 'Only owners and admins remove people'
  if (m.role === 'OWNER' && props.account.role !== 'OWNER') return 'Only an owner can remove an owner'
  return null
}

async function changeRole(m: AccountMember, next: string): Promise<void> {
  if (next === m.role) return
  try {
    await apiFetch(`/accounts/${props.account.id}/members/${m.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: next }),
    })
    toast.success(`${m.name || m.email} is now ${accountRoleLabel(next).toLowerCase()}`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not change the role')
  }
  await load()
}

async function remove(m: AccountMember): Promise<void> {
  const self = m.userId === auth.user?.id
  // A failed DELETE keeps the dialog open with the server's reason in it.
  const done = await confirm({
    title: self ? 'Leave account' : 'Remove member',
    subjectLabel: self ? 'Account' : 'Member',
    subject: self ? props.account.name : m.email,
    message: self
      ? 'You lose access to every project in it. Someone who manages it has to add you again.'
      : 'They lose access to every project in this account.',
    confirmLabel: self ? 'Leave account' : 'Remove member',
    onConfirm: async () => {
      await apiFetch(`/accounts/${props.account.id}/members/${m.userId}`, { method: 'DELETE' })
    },
  })
  if (!done) return
  if (self) {
    await accountsStore.load()
    void router.push({ name: 'dashboard' })
    return
  }
  await load()
}

// ── Adding someone ─────────────────────────────────────────────────────────
const adding = ref(false)
const email = ref('')
const role = ref<AccountRole>('MEMBER')
const saving = ref(false)
const addError = ref('')

function closeAdd(): void {
  adding.value = false
  email.value = ''
  role.value = 'MEMBER'
  addError.value = ''
}

async function add(): Promise<void> {
  saving.value = true
  addError.value = ''
  try {
    await apiFetch(`/accounts/${props.account.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: email.value.trim(), role: role.value }),
    })
    toast.success(`${email.value.trim()} added`)
    closeAdd()
    await load()
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Could not add them'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.members {
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
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
