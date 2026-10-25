<template>
  <!-- The account's Settings, behind the gear at the foot of the rail (fleet
       standard, "Every rail has the same anatomy"): the account's name, its
       people and their roles, and, for instance operators, its plan. A
       project's own configuration is that project's Settings, and personal
       settings are in the user menu. -->
  <div class="tab-content settings-tab">
    <nav class="settings-sidenav">
      <NbButton
        :variant="section === 'general' ? 'secondary' : 'ghost'"
        :outlined="section === 'general'"
        @click="go('general')"
      >
        <NbIcon name="gear" :size="16" /> General
      </NbButton>
      <NbButton
        :variant="section === 'members' ? 'secondary' : 'ghost'"
        :outlined="section === 'members'"
        @click="go('members')"
      >
        <NbIcon name="users" :size="16" /> Members
      </NbButton>
      <NbButton
        v-if="isOperator"
        :variant="section === 'plan' ? 'secondary' : 'ghost'"
        :outlined="section === 'plan'"
        @click="go('plan')"
      >
        <NbIcon name="receipt" :size="16" /> Plan &amp; Entitlements
      </NbButton>
    </nav>

    <div class="settings-pane">
      <NbEmptyState
        v-if="accountsStore.loaded && !account"
        :title="t('dashboard.noAccountTitle')"
        :description="t('dashboard.noAccountBody')"
        bordered
      />

      <template v-else-if="account">
        <div v-if="accountsStore.accounts.length > 1" class="account-picker">
          <NbSelect
            label="Account"
            :model-value="account.id"
            :options="accountOptions"
            @update:model-value="accountsStore.select(String($event))"
          />
        </div>

        <!-- ── General ── -->
        <template v-if="section === 'general'">
          <section class="section">
            <h3>{{ account.name }}</h3>
            <NbDefinitionList :items="generalItems" />
          </section>
          <NbForm v-if="accountsStore.canManage" title="Account name">
            <NbTextInput v-model="renameEdit" label="Rename account" :error="renameError" />
            <template #footer>
              <NbButton variant="primary" :loading="renameSaving" :disabled="!renameEdit.trim()" @click="saveRename">
                Rename
              </NbButton>
            </template>
          </NbForm>
        </template>

        <!-- ── Members ── -->
        <template v-else-if="section === 'members'">
          <section class="section">
            <h3>Members</h3>
            <p class="hint">
              Members work in the account's projects they are added to. Admins add and remove people. Owners also manage
              other owners, and an account always keeps one.
            </p>
            <NbDataTable :columns="memberColumns" :rows="members" row-key="userId" :loading="membersLoading">
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
                  :options="roleOptionsFor()"
                  :aria-label="`Role of ${row.email}`"
                  @update:model-value="changeRole(row, String($event))"
                />
                <NbBadge v-else :variant="row.role === 'OWNER' ? 'purple' : row.role === 'ADMIN' ? 'blue' : 'grey'">
                  {{ roleLabel(row.role) }}
                </NbBadge>
              </template>
              <template #cell-actions="{ row }">
                <NbButton v-if="row.userId === auth.user?.id" size="sm" variant="ghost" @click="removeMember(row)">
                  Leave
                </NbButton>
                <NbButton v-else-if="canRemove(row)" size="sm" variant="danger" @click="removeMember(row)">
                  Remove
                </NbButton>
              </template>
            </NbDataTable>
          </section>

          <NbForm v-if="accountsStore.canManage" title="Add a member">
            <p class="hint">They need to have signed in to Verba once.</p>
            <div class="add-row">
              <NbTextInput v-model="newEmail" type="email" label="Email" placeholder="name@example.com" />
              <NbSelect v-model="newRole" label="Role" :options="roleOptionsFor()" />
            </div>
            <p v-if="memberError" class="field-error">{{ memberError }}</p>
            <template #footer>
              <NbButton variant="primary" :loading="memberAdding" :disabled="!newEmail.trim()" @click="addMember">
                Add
              </NbButton>
            </template>
          </NbForm>
          <p v-if="actionError" class="field-error">{{ actionError }}</p>
        </template>

        <!-- ── Plan & Entitlements (operators) ── -->
        <AccountPlan v-else-if="section === 'plan' && isOperator" :account-id="account.id" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiFetch } from '../api'
import { useAuthStore } from '../stores/auth'
import { useAccountsStore, type AccountRole } from '../stores/accounts'
import AccountPlan from '../components/settings/AccountPlan.vue'

interface AccountMember {
  userId: string
  role: AccountRole
  email: string
  name: string | null
  avatarUrl: string | null
  deactivated: boolean
}

type Section = 'general' | 'members' | 'plan'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const accountsStore = useAccountsStore()

const account = computed(() => accountsStore.current)
const isOperator = computed(() => Boolean(auth.user?.isGlobalAdmin))
const myRole = computed(() => account.value?.role)

const section = computed<Section>(() => {
  const s = route.query.section
  if (s === 'members') return 'members'
  if (s === 'plan' && isOperator.value) return 'plan'
  return 'general'
})

function go(next: Section) {
  void router.replace({ query: { ...route.query, section: next === 'general' ? undefined : next } })
}

const accountOptions = computed(() => accountsStore.accounts.map((a) => ({ label: a.name, value: a.id })))

// ── General ────────────────────────────────────────────────────────────────
const renameEdit = ref('')
const renameSaving = ref(false)
const renameError = ref('')

const generalItems = computed(() =>
  account.value
    ? [
        { term: 'Slug', value: account.value.slug },
        { term: 'Your role', value: roleLabel(account.value.role) },
        { term: 'Projects', value: account.value.projectCount },
      ]
    : [],
)

async function saveRename() {
  if (!account.value) return
  renameSaving.value = true
  renameError.value = ''
  try {
    await apiFetch(`/accounts/${account.value.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: renameEdit.value.trim() }),
    })
    await accountsStore.load()
  } catch (e) {
    renameError.value = e instanceof Error ? e.message : 'Could not rename the account'
  } finally {
    renameSaving.value = false
  }
}

// ── Members ────────────────────────────────────────────────────────────────
const members = ref<AccountMember[]>([])
const membersLoading = ref(false)
const newEmail = ref('')
const newRole = ref<AccountRole>('MEMBER')
const memberAdding = ref(false)
const memberError = ref('')
const actionError = ref('')

const memberColumns = [
  { key: 'person', header: 'Person', primary: true },
  { key: 'role', header: 'Role', width: '180px' },
  { key: 'actions', header: '', width: '110px', align: 'right' as const },
]

function roleLabel(role: string): string {
  return role === 'OWNER' ? 'Owner' : role === 'ADMIN' ? 'Admin' : 'Member'
}

/** Admins give roles below owner, owners give any. */
function roleOptionsFor() {
  const all = [
    { label: 'Member', value: 'MEMBER' },
    { label: 'Admin', value: 'ADMIN' },
  ]
  return myRole.value === 'OWNER' ? [...all, { label: 'Owner', value: 'OWNER' }] : all
}

function canChangeRole(m: AccountMember): boolean {
  if (!accountsStore.canManage || m.userId === auth.user?.id) return false
  return m.role !== 'OWNER' || myRole.value === 'OWNER'
}

function canRemove(m: AccountMember): boolean {
  if (!accountsStore.canManage) return false
  return m.role !== 'OWNER' || myRole.value === 'OWNER'
}

async function loadMembers() {
  if (!account.value) return
  membersLoading.value = true
  try {
    members.value = await apiFetch<AccountMember[]>(`/accounts/${account.value.id}/members`)
  } catch {
    members.value = []
  } finally {
    membersLoading.value = false
  }
}

async function addMember() {
  if (!account.value) return
  memberAdding.value = true
  memberError.value = ''
  try {
    await apiFetch(`/accounts/${account.value.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ email: newEmail.value.trim(), role: newRole.value }),
    })
    newEmail.value = ''
    newRole.value = 'MEMBER'
    await loadMembers()
  } catch (e) {
    memberError.value = e instanceof Error ? e.message : 'Could not add them'
  } finally {
    memberAdding.value = false
  }
}

async function changeRole(m: AccountMember, role: string) {
  if (!account.value || role === m.role) return
  actionError.value = ''
  try {
    await apiFetch(`/accounts/${account.value.id}/members/${m.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Could not change the role'
  }
  await loadMembers()
}

async function removeMember(m: AccountMember) {
  if (!account.value) return
  const self = m.userId === auth.user?.id
  const question = self
    ? `Leave ${account.value.name}? You lose access to every project in it.`
    : `Remove ${m.email} from ${account.value.name}? They lose access to every project in it.`
  if (!window.confirm(question)) return
  actionError.value = ''
  try {
    await apiFetch(`/accounts/${account.value.id}/members/${m.userId}`, { method: 'DELETE' })
    if (self) {
      await accountsStore.load()
      void router.push('/dashboard')
      return
    }
    await loadMembers()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Could not remove them'
  }
}

watch(
  () => account.value?.id,
  () => {
    renameEdit.value = account.value?.name ?? ''
    if (section.value === 'members') void loadMembers()
  },
)
watch(section, (s) => {
  if (s === 'members') void loadMembers()
})

onMounted(async () => {
  await accountsStore.ensureLoaded()
  renameEdit.value = account.value?.name ?? ''
  if (section.value === 'members') void loadMembers()
})
</script>

<style scoped lang="scss">
.settings-tab {
  display: flex;
  align-items: flex-start;
  min-height: 480px;
}

.settings-sidenav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--nb-c-border);
  padding: 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-self: stretch;
}

.settings-pane {
  flex: 1;
  min-width: 0;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: var(--nb-spacing-24);
}

.account-picker {
  max-width: 320px;
}

.section h3 {
  margin: 0 0 var(--nb-spacing-12);
}

.hint {
  margin: 0 0 var(--nb-spacing-12);
  color: var(--nb-c-text-subtle);
  font-size: var(--nb-type-body-sm-size);
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

.add-row {
  display: grid;
  grid-template-columns: 1fr 180px;
  gap: var(--nb-spacing-12);
}

.field-error {
  margin: 0;
  color: var(--nb-c-status-error);
  font-size: var(--nb-type-body-sm-size);
}

// On a phone the section list becomes one scrolling row above the pane, as
// in project settings. Gated, so the desktop does not move.
@include variables.phone {
  .settings-tab {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-sidenav {
    width: auto;
    flex-direction: row;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--nb-c-border);
    padding: 0.5rem 0;
    gap: 0.25rem;

    > * {
      flex-shrink: 0;
    }
  }

  .settings-pane {
    padding: 1rem 0;
  }

  .add-row {
    grid-template-columns: 1fr;
  }
}
</style>
