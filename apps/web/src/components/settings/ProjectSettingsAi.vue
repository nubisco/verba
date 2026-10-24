<template>
  <!-- Project settings, AI. Built only from @nubisco/ui's NbAiProvider, NbAiUsage
       and NbBriefing, the same as Analytics', Acta's and Erigo's AI tabs
       (AGENTS.md, "AI briefings" and "AI features"). Verba sends nothing
       anywhere on its own, so the tab is called AI and the one feature that
       uses the key has no destinations. -->
  <div class="ai">
    <NbSkeleton v-if="loading" variant="block" height="14rem" label="Loading AI settings" />

    <NbMessage v-else-if="loadError" variant="error">{{ loadError }}</NbMessage>

    <template v-else-if="settings">
      <div class="ai__top">
        <NbAiProvider
          v-model:provider="provider"
          v-model:model="model"
          v-model:api-key="apiKey"
          title="AI provider"
          :default-models="settings.defaultModels"
          :has-key="settings.hasKey"
          :busy="saving"
          @save="saveProvider"
          @remove="removeKey"
        >
          <p>
            Bring your own provider key. Verba never supplies one and never falls back to one: every request is billed
            by your provider, to this key. What is sent is the string being translated, its key name and developer note,
            and the same key's text in other locales, never anything about the people in this project. Keys come from
            {{ keyHelp }}.
          </p>
          <NbMessage v-if="!settings.canStoreKey" variant="warning">
            This server has no AI_ENCRYPTION_KEY, so a key cannot be saved. Ask the person who runs Verba to set one.
          </NbMessage>
          <NbMessage v-if="settings.keyUnreadable" variant="warning">
            The stored key can no longer be read on this server. Enter it again to keep using suggestions.
          </NbMessage>
          <NbMessage v-if="providerError" variant="error">{{ providerError }}</NbMessage>
          <NbMessage v-if="providerSaved" variant="success">{{ providerSaved }}</NbMessage>
          <p v-if="settings.updatedAt" class="ai__meta">Last changed {{ changedAt }}.</p>
        </NbAiProvider>

        <NbAiUsage
          :has-key="settings.hasKey"
          :loading="usageLoading"
          :days="usage?.days ?? 30"
          requests-label="Translations requested"
          :requests="usage?.requests ?? 0"
          :input-tokens="usage?.inputTokens ?? 0"
          :output-tokens="usage?.outputTokens ?? 0"
          :estimated-cost-usd="usage?.estimatedUsd ?? null"
          :unpriced-models="usage?.unpricedModels ?? []"
          :pricing-verified-on="usage?.pricingVerifiedOn ?? ''"
        />
      </div>

      <NbBriefing v-model:enabled="enabled" title="Translation suggestions" :status="suggestionsStatus" :busy="saving">
        <template #description>
          <p>
            Translators can ask for a suggestion beside a translation, and a locale imported from XLIFF can be filled in
            one go. A suggestion is only a draft: it goes through review and approval like any other translation.
          </p>
        </template>

        <p class="ai__meta">
          Every answer is checked before anybody sees it. One that drops or adds a placeholder, markup or a link is not
          shown, and a locale fill skips it rather than writing it.
        </p>
        <NbMessage v-if="enabledError" variant="error">{{ enabledError }}</NbMessage>

        <template #actions>
          <NbButton variant="primary" :loading="saving" @click="saveEnabled">Save translation suggestions</NbButton>
        </template>

        <template #preview>
          <NbField
            label="Try a string"
            orientation="stack"
            hint="Translated and checked exactly as a suggestion is. Nothing is saved."
          >
            <NbTextInput v-model="previewSource" placeholder="Welcome back, %@" autocomplete="off" />
          </NbField>
          <NbField label="Into" orientation="stack">
            <NbSelect v-model="previewLocale" :options="localeOptions" />
          </NbField>
          <NbButton
            :loading="previewing"
            :disabled="!settings.hasKey || !previewSource.trim() || !previewLocale"
            @click="runPreview"
          >
            Preview
          </NbButton>
          <p v-if="previewResult" class="ai__preview"><NbAiLabel static size="sm" /> {{ previewResult }}</p>
          <NbMessage v-if="previewError" variant="warning">{{ previewError }}</NbMessage>
        </template>
      </NbBriefing>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ISelectOption } from '@nubisco/ui'
import { apiFetch } from '../../api'
import type { Locale } from '../../stores/project'

type Provider = 'anthropic' | 'openai' | 'gemini'

interface AiSettings {
  enabled: boolean
  provider: Provider
  model: string | null
  hasKey: boolean
  keyUnreadable: boolean
  canStoreKey: boolean
  defaultModels: Record<Provider, string>
  updatedAt: string | null
}

interface AiUsage {
  requests: number
  inputTokens: number
  outputTokens: number
  estimatedUsd: number | null
  unpricedModels: string[]
  pricingVerifiedOn: string
  days: number
}

const props = defineProps<{ projectId: string; locales: Locale[] }>()
const emit = defineEmits<{ changed: [settings: AiSettings] }>()

const loading = ref(true)
const loadError = ref('')
const settings = ref<AiSettings | null>(null)
const usage = ref<AiUsage | null>(null)
const usageLoading = ref(false)
const saving = ref(false)

const provider = ref<string>('anthropic')
const model = ref('')
const apiKey = ref('')
const enabled = ref(false)
const providerError = ref('')
const providerSaved = ref('')
const enabledError = ref('')

const previewSource = ref('')
const previewLocale = ref('')
const previewing = ref(false)
const previewResult = ref('')
const previewError = ref('')

const keyHelp = computed(
  () =>
    ({
      anthropic: 'console.anthropic.com',
      openai: 'platform.openai.com',
      gemini: 'aistudio.google.com',
    })[provider.value] ?? 'your provider',
)

const localeOptions = computed<ISelectOption[]>(() =>
  props.locales.map((l) => ({ label: `${l.name} (${l.code})`, value: l.code })),
)

const changedAt = computed(() => (settings.value?.updatedAt ? new Date(settings.value.updatedAt).toLocaleString() : ''))

const suggestionsStatus = computed(() => {
  if (!settings.value) return ''
  if (!settings.value.hasKey) return 'Off: no key'
  if (settings.value.keyUnreadable) return 'Off: the key must be entered again'
  return settings.value.enabled ? 'On' : 'Off'
})

function apply(next: AiSettings) {
  settings.value = next
  provider.value = next.provider
  model.value = next.model ?? ''
  enabled.value = next.enabled
  apiKey.value = ''
  emit('changed', next)
}

async function loadUsage() {
  usageLoading.value = true
  try {
    usage.value = (await apiFetch<{ usage: AiUsage }>(`/projects/${props.projectId}/ai/usage`)).usage
  } catch {
    // Usage is a report, not a control: the settings still work without it.
  } finally {
    usageLoading.value = false
  }
}

async function persist(body: Record<string, unknown>): Promise<boolean> {
  saving.value = true
  try {
    const res = await apiFetch<{ settings: AiSettings }>(`/projects/${props.projectId}/ai/settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    apply(res.settings)
    return true
  } finally {
    saving.value = false
  }
}

async function saveProvider() {
  providerError.value = ''
  providerSaved.value = ''
  try {
    const body: Record<string, unknown> = { provider: provider.value, model: model.value.trim() || null }
    if (apiKey.value.trim()) body.apiKey = apiKey.value.trim()
    await persist(body)
    providerSaved.value = 'AI settings saved.'
    void loadUsage()
  } catch (e) {
    providerError.value = e instanceof Error ? e.message : 'The AI settings were not saved'
  }
}

async function removeKey() {
  providerError.value = ''
  providerSaved.value = ''
  try {
    await persist({ apiKey: null })
    providerSaved.value = 'Key removed. Suggestions are off until a new one is saved.'
  } catch (e) {
    providerError.value = e instanceof Error ? e.message : 'The key was not removed'
  }
}

async function saveEnabled() {
  enabledError.value = ''
  try {
    await persist({ enabled: enabled.value })
  } catch (e) {
    enabledError.value = e instanceof Error ? e.message : 'Translation suggestions were not saved'
  }
}

async function runPreview() {
  previewing.value = true
  previewResult.value = ''
  previewError.value = ''
  try {
    const res = await apiFetch<{ suggestion: string | null; rejected?: string }>(
      `/projects/${props.projectId}/ai/preview`,
      { method: 'POST', body: JSON.stringify({ source: previewSource.value, localeCode: previewLocale.value }) },
    )
    if (res.suggestion) previewResult.value = res.suggestion
    else previewError.value = `Not shown: ${res.rejected ?? 'the answer failed the check'}.`
    void loadUsage()
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : 'The preview failed'
  } finally {
    previewing.value = false
  }
}

onMounted(async () => {
  try {
    apply((await apiFetch<{ settings: AiSettings }>(`/projects/${props.projectId}/ai/settings`)).settings)
    previewLocale.value = props.locales.find((l) => l.code !== 'en')?.code ?? props.locales[0]?.code ?? ''
    void loadUsage()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'AI settings did not load'
  } finally {
    loading.value = false
  }
})
</script>

<style lang="scss" scoped>
// The provider and what it has cost side by side on a desktop, then the
// feature that uses them, the same layout as Acta's, Analytics' and Erigo's AI tabs.
.ai {
  display: grid;
  gap: var(--nb-spacing-16);
  min-width: 0;

  &__top {
    display: grid;
    grid-template-columns: minmax(0, 44rem) minmax(20rem, 1fr);
    gap: var(--nb-spacing-16);
    align-items: start;

    @media (max-width: 75rem) {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__meta {
    margin: 0;
    color: var(--nb-c-text-muted);
    font-size: var(--nb-font-size-13);
  }

  &__preview {
    margin: 0;
    overflow-wrap: anywhere;
  }
}
</style>
