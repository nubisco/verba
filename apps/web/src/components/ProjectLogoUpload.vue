<template>
  <div class="project-logo-upload">
    <!-- Clickable avatar with camera overlay -->
    <NbButton class="project-logo-upload__trigger" :disabled="saving" @click="openModal">
      <img v-if="isLogo" :src="modelValue!" class="project-logo-upload__img" alt="Project logo" />
      <span v-else class="project-logo-upload__initials">{{ displayText }}</span>
      <div class="project-logo-upload__overlay" aria-hidden="true">
        <NbIcon name="camera" :size="18" />
      </div>
    </NbButton>
  </div>

  <NbModal :open="modalOpen" title="Change Project Logo" size="md" @close="closeModal">
    <!-- Step 1: file picker -->
    <template v-if="step === 'select'">
      <NbFileUploader accept="image/*" :max-size="MAX_FILE_SIZE" @change="onFilesSelected" />
    </template>

    <!-- Step 2: crop -->
    <template v-else>
      <NbImageCropper :image="selectedFile!" :lock-aspect-ratio="true" @crop="onCrop" />
    </template>

    <template #footer>
      <NbButton v-if="step === 'crop'" variant="ghost" @click="step = 'select'">Back</NbButton>
      <NbButton variant="ghost" @click="closeModal">Cancel</NbButton>
      <NbButton
        v-if="step === 'crop'"
        variant="primary"
        :loading="applying"
        :disabled="!lastCropBlob"
        @click="applyLogo"
      >
        Apply
      </NbButton>
    </template>
  </NbModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const LOGO_OUTPUT_SIZE = 128

const props = defineProps<{
  modelValue?: string | null
  projectName: string
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const modalOpen = ref(false)
const step = ref<'select' | 'crop'>('select')
const selectedFile = ref<File | null>(null)
const lastCropBlob = ref<Blob | null>(null)
const applying = ref(false)

const isLogo = computed(() => !!props.modelValue?.startsWith('data:image/'))

const displayText = computed(() => {
  if (props.modelValue && !isLogo.value) return props.modelValue
  return props.projectName.trim().slice(0, 2).toUpperCase()
})

function openModal() {
  step.value = 'select'
  selectedFile.value = null
  lastCropBlob.value = null
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
}

function onFilesSelected(files: File[]) {
  if (!files.length) return
  selectedFile.value = files[0]
  lastCropBlob.value = null
  step.value = 'crop'
}

function onCrop({ blob }: { blob: Blob }) {
  lastCropBlob.value = blob
}

async function applyLogo() {
  if (!lastCropBlob.value) return
  applying.value = true
  try {
    const dataUrl = await resizeToDataUrl(lastCropBlob.value, LOGO_OUTPUT_SIZE)
    emit('update:modelValue', dataUrl)
    closeModal()
  } finally {
    applying.value = false
  }
}

function resizeToDataUrl(blob: Blob, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, size, size)
      URL.revokeObjectURL(blobUrl)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      reject(new Error('Failed to resize image'))
    }
    image.src = blobUrl
  })
}
</script>

<style scoped lang="scss">
.project-logo-upload {
  display: inline-flex;
}

.project-logo-upload__trigger {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: none;
  background: rgba(124, 58, 237, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  flex-shrink: 0;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:not(:disabled):hover .project-logo-upload__overlay {
    opacity: 1;
  }
}

.project-logo-upload__initials {
  font-family: var(--nb-font-family-sans, sans-serif);
  font-size: 20px;
  font-weight: 700;
  color: rgba(167, 139, 250, 1);
  letter-spacing: 0.03em;
  line-height: 1;
  user-select: none;
}

.project-logo-upload__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-logo-upload__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
}
</style>
