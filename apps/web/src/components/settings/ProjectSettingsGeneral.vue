<template>
  <div class="general">
    <NbPanel class="general__section">
      <header>
        <h2 class="type-heading-01">Project</h2>
      </header>

      <form class="general__form" @submit.prevent="save">
        <!-- The logo, beside the name in the trail and on Home. Saved at once,
             like a space's icon in Acta, and removed from the picture itself
             (fleet standard, "A picture someone adds, they can remove"). -->
        <div class="general__logo">
          <NbImagePicker
            :src="logo"
            :alt="`Logo of ${project.name}`"
            label="Add a logo"
            drop-label="Drop to use as the logo"
            replace-label="Replace the logo"
            remove-label="Remove the logo"
            :accept="LOGO_ACCEPT"
            :max-size="LOGO_MAX_BYTES"
            :loading="logoBusy"
            :disabled="!store.isMaintainer"
            :removable="store.isMaintainer"
            size="5rem"
            fit="contain"
            @pick="pickLogo"
            @remove="removeLogo"
            @reject="rejectLogo"
          />
          <p class="general__lede">
            {{
              store.isMaintainer
                ? 'Shown beside the name on Home and in the trail. PNG, JPEG, GIF, WebP, AVIF or SVG, up to 5 MB.'
                : 'Shown beside the name on Home and in the trail. Only a maintainer can change it.'
            }}
          </p>
        </div>

        <NbTextInput
          id="project-name"
          v-model="name"
          label="Name"
          :readonly="!store.isMaintainer"
          required
          :error="nameError"
        />
        <NbTextInput
          id="project-slug"
          :model-value="project.slug"
          label="Slug"
          readonly
          helper="The command line and the API name the project by it, so it does not change."
        />
        <div v-if="store.isMaintainer" class="general__actions">
          <NbButton type="submit" variant="primary" :loading="saving" :disabled="!dirty || !name.trim()">Save</NbButton>
        </div>
      </form>
    </NbPanel>

    <NbPanel v-if="store.isAdmin" class="general__section">
      <header class="general__head">
        <div>
          <h2 class="type-heading-01">Delete this project</h2>
          <p class="general__lede">
            Its keys, translations, comments and history go with it, for good. Export it first if you may need any of
            it.
          </p>
        </div>
        <NbButton variant="danger" @click="deleteProject">Delete project</NbButton>
      </header>
    </NbPanel>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm, useToast } from '@nubisco/ui'
import { apiFetch } from '../../api'
import { useProjectStore, type ProjectData } from '../../stores/project'
import { useProjectListStore } from '../../stores/projectList'
import { LOGO_ACCEPT, LOGO_MAX_BYTES, isLogo, toLogoDataUrl } from '../../utils/logo'

const props = defineProps<{ projectId: string }>()

const router = useRouter()
const store = useProjectStore()
const projectList = useProjectListStore()
const toast = useToast()
const confirm = useConfirm()

const project = computed(() => store.project as ProjectData)
const logo = computed(() => (isLogo(project.value.avatar) ? project.value.avatar : undefined))

// ── Name ──────────────────────────────────────────────────────────────────
const name = ref(project.value.name)
const nameError = ref('')
const saving = ref(false)
const dirty = computed(() => name.value.trim() !== project.value.name)
watch(
  () => project.value.name,
  (next) => (name.value = next),
)

async function save(): Promise<void> {
  saving.value = true
  nameError.value = ''
  try {
    const updated = await apiFetch<{ name: string }>(`/projects/${props.projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.value.trim() }),
    })
    if (store.project) store.project.name = updated.name
    projectList.invalidate(project.value.accountId)
    toast.success('Saved')
  } catch (e) {
    nameError.value = e instanceof Error ? e.message : 'Could not rename the project'
  } finally {
    saving.value = false
  }
}

// ── Logo ──────────────────────────────────────────────────────────────────
const logoBusy = ref(false)

async function setAvatar(avatar: string | null): Promise<void> {
  logoBusy.value = true
  try {
    const updated = await apiFetch<{ avatar?: string | null }>(`/projects/${props.projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ avatar }),
    })
    if (store.project) store.project.avatar = updated.avatar ?? null
    projectList.invalidate(project.value.accountId)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not save the logo')
  } finally {
    logoBusy.value = false
  }
}

async function pickLogo(file: File): Promise<void> {
  try {
    await setAvatar(await toLogoDataUrl(file))
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'The picture could not be read')
  }
}

function removeLogo(): void {
  void setAvatar(null)
}

function rejectLogo({ reason }: { reason: string }): void {
  toast.error(
    reason === 'size' ? 'That picture is over 5 MB.' : 'That is not a picture Verba can use. Try PNG, JPEG or SVG.',
  )
}

// ── Delete ────────────────────────────────────────────────────────────────
async function deleteProject(): Promise<void> {
  const done = await confirm({
    title: 'Delete project',
    subjectLabel: 'Project',
    subject: project.value.name,
    message: 'Its keys, translations, comments and history are deleted for good.',
    typeToConfirm: project.value.slug,
    typeToConfirmLabel: `Type ${project.value.slug} to confirm`,
    confirmLabel: 'Delete project',
    onConfirm: async () => {
      await apiFetch(`/projects/${props.projectId}`, { method: 'DELETE' })
    },
  })
  if (!done) return
  projectList.invalidate(project.value.accountId)
  void router.replace({ name: 'dashboard' })
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

  &__head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--nb-spacing-16);
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--nb-spacing-16);
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: var(--nb-spacing-16);
  }

  &__lede {
    max-width: 68ch;
    margin: var(--nb-spacing-4) 0 0;
    color: var(--nb-c-text-subtle);
    font-size: var(--nb-type-body-sm-size);
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
  }
}

// A phone: the delete button goes under its description rather than beside
// it squeezing the text to half the width.
@include variables.phone {
  .general__head {
    flex-wrap: wrap;
  }
}
</style>
