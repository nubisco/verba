import { decrypt, isEncrypted } from './encryption.service.js'

export interface AiConfig {
  provider: string
  model: string | null
  apiKey: string
}

interface ProjectAiFields {
  aiEnabled: boolean
  aiProvider: string | null
  aiApiKey: string | null
  aiModel: string | null
}

/** Validate a project's AI configuration and return a usable, decrypted config. */
export function getProjectAiConfig(project: ProjectAiFields): AiConfig {
  if (!project.aiEnabled || !project.aiApiKey || !project.aiProvider) {
    throw Object.assign(new Error('AI is not configured for this project'), { statusCode: 422 })
  }
  const apiKey = isEncrypted(project.aiApiKey) ? decrypt(project.aiApiKey) : project.aiApiKey
  return { provider: project.aiProvider, model: project.aiModel, apiKey }
}

/** Run a single translation prompt through the configured provider. */
export async function translateString(config: AiConfig, prompt: string): Promise<string> {
  if (config.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw Object.assign(
        new Error((err as { error?: { message?: string } }).error?.message ?? 'OpenAI request failed'),
        { statusCode: 502 },
      )
    }
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content?.trim() ?? ''
  }

  if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model || 'claude-3-haiku-20240307',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw Object.assign(
        new Error((err as { error?: { message?: string } }).error?.message ?? 'Anthropic request failed'),
        { statusCode: 502 },
      )
    }
    const data = (await response.json()) as { content: Array<{ text: string }> }
    return data.content[0]?.text?.trim() ?? ''
  }

  if (config.provider === 'gemini') {
    const model = config.model || 'gemini-2.0-flash-lite'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
        }),
      },
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } }).error?.message ?? 'Gemini request failed'
      throw Object.assign(new Error(msg), { statusCode: 502 })
    }
    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }
    return data.candidates[0]?.content?.parts[0]?.text?.trim() ?? ''
  }

  throw Object.assign(new Error(`Unsupported AI provider: ${config.provider}`), { statusCode: 422 })
}

/**
 * Build a translation prompt that carries placeholder constraints, so the model
 * is told to keep printf placeholders (%@, %lld, %1$@, %%) verbatim.
 */
export function buildTranslationPrompt(opts: {
  source: string
  targetLanguageName: string
  targetLanguageCode: string
  keyLabel?: string
  note?: string
  placeholders?: string[]
}): string {
  const lines = [
    `You are a professional i18n translator. Translate the following UI string to ${opts.targetLanguageName} (${opts.targetLanguageCode}).`,
    opts.keyLabel ? `Key: ${opts.keyLabel}` : '',
    opts.note ? `Developer note: ${opts.note}` : '',
    `Source: "${opts.source}"`,
    opts.placeholders && opts.placeholders.length
      ? `IMPORTANT: keep every placeholder exactly as-is and do not translate, drop, add, or reorder them: ${opts.placeholders.join(' ')}`
      : '',
    `Provide ONLY the translated string, no explanation, no quotes.`,
  ]
  return lines.filter(Boolean).join('\n')
}
