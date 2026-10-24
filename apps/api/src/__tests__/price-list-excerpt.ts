import { reducePriceList } from '../services/ai-prices.service.js'

/**
 * A few real entries from LiteLLM's price list, copied on 2026-10-23 (the same excerpt as
 * Erigo's tests), in the
 * file's own shape. Test data only: the product reads the live list.
 *
 * It carries the cases matching has to get right: bare keys (Anthropic,
 * OpenAI), a prefixed key (Gemini), the same model on other hosts at other
 * prices, and an entry with no price at all.
 */
export const PRICE_LIST_EXCERPT = {
  sample_spec: {
    input_cost_per_token: 0.0,
    litellm_provider: 'one of https://docs.litellm.ai/docs/providers',
    output_cost_per_token: 0.0,
  },
  'claude-haiku-4-5': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 1e-6,
    output_cost_per_token: 5e-6,
  },
  'claude-opus-5': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 5e-6,
    output_cost_per_token: 2.5e-5,
  },
  'us.anthropic.claude-opus-5': {
    litellm_provider: 'bedrock_converse',
    mode: 'chat',
    input_cost_per_token: 5.5e-6,
    output_cost_per_token: 2.75e-5,
  },
  'vertex_ai/claude-opus-5': {
    litellm_provider: 'vertex_ai-anthropic_models',
    mode: 'chat',
    input_cost_per_token: 5e-6,
    output_cost_per_token: 2.5e-5,
  },
  'claude-sonnet-5': {
    litellm_provider: 'anthropic',
    mode: 'chat',
    input_cost_per_token: 2e-6,
    output_cost_per_token: 1e-5,
  },
  'gpt-5.6-luna': {
    litellm_provider: 'openai',
    mode: 'chat',
    input_cost_per_token: 2e-7,
    output_cost_per_token: 1.2e-6,
  },
  'azure/us/gpt-5.6-luna': {
    litellm_provider: 'azure',
    mode: 'chat',
    input_cost_per_token: 2.2e-7,
    output_cost_per_token: 1.32e-6,
  },
  'chatgpt/gpt-5.6-luna': {
    litellm_provider: 'chatgpt',
    mode: 'responses',
    input_cost_per_token: null,
    output_cost_per_token: null,
  },
  'gemini/gemini-3.5-flash-lite': {
    litellm_provider: 'gemini',
    mode: 'chat',
    input_cost_per_token: 3e-7,
    output_cost_per_token: 2.5e-6,
  },
  'gemini-3.5-flash-lite': {
    litellm_provider: 'vertex_ai-language-models',
    mode: 'chat',
    input_cost_per_token: 3e-7,
    output_cost_per_token: 2.5e-6,
  },
}

/** The excerpt as the database would hold it after a fetch at `fetchedAt`. */
export function storedPriceRow(fetchedAt: number): { id: number; prices: string; fetchedAt: Date } {
  return { id: 1, prices: JSON.stringify(reducePriceList(PRICE_LIST_EXCERPT)), fetchedAt: new Date(fetchedAt) }
}
