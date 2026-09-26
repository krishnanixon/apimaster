/**
 * Central catalog of OpenAI models available to the app.
 *
 * Shared between the main process (cost estimation, request params) and the
 * renderer (model picker, usage dashboard). Prices are USD per 1M tokens and
 * are used only to produce *estimated* spend in the usage dashboard — they are
 * not billed and can drift from OpenAI's live pricing.
 */

import type { CloudProviderId } from '../types/ai'

export type AiModelCategory = 'flagship' | 'reasoning' | 'efficient' | 'legacy'

export interface AiModelInfo {
  value: string
  label: string
  description: string
  category: AiModelCategory
  /** USD per 1M input (prompt) tokens. */
  inputPer1M: number
  /** USD per 1M output (completion) tokens. */
  outputPer1M: number
  /** Reasoning / GPT-5 family models reject custom temperature and use max_completion_tokens. */
  supportsTemperature: boolean
  tokenParam: 'max_tokens' | 'max_completion_tokens'
}

/**
 * Ordered so the picker shows current, general-purpose models first.
 * Pricing reflects OpenAI's published API rates (mid-2026).
 */
export const AI_MODEL_CATALOG: AiModelInfo[] = [
  // ── Flagship / general purpose ────────────────────────────────────────────
  {
    value: 'gpt-5.5',
    label: 'GPT-5.5',
    description: 'Flagship model for complex reasoning and coding.',
    category: 'flagship',
    inputPer1M: 5.0,
    outputPer1M: 30.0,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },
  {
    value: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Production workhorse with a very large context window.',
    category: 'flagship',
    inputPer1M: 2.5,
    outputPer1M: 15.0,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },
  {
    value: 'gpt-5',
    label: 'GPT-5',
    description: 'Best value flagship for agentic workflows.',
    category: 'flagship',
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    description: 'Balanced cost and capability for chatbots.',
    category: 'efficient',
    inputPer1M: 0.25,
    outputPer1M: 2.0,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },
  {
    value: 'gpt-4.1',
    label: 'GPT-4.1',
    description: 'Reliable production model with 1M-token context.',
    category: 'flagship',
    inputPer1M: 2.0,
    outputPer1M: 8.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    description: 'Best value for long-context tasks.',
    category: 'efficient',
    inputPer1M: 0.4,
    outputPer1M: 1.6,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    description: 'Cheapest model — classification, routing, extraction.',
    category: 'efficient',
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gpt-4o',
    label: 'GPT-4o',
    description: 'Multimodal model — vision and text.',
    category: 'flagship',
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Fast, low-cost default for everyday generation.',
    category: 'efficient',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },

  // ── Reasoning (o-series) ──────────────────────────────────────────────────
  {
    value: 'o3',
    label: 'o3',
    description: 'Advanced multi-step reasoning.',
    category: 'reasoning',
    inputPer1M: 2.0,
    outputPer1M: 8.0,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },
  {
    value: 'o4-mini',
    label: 'o4-mini',
    description: 'Most cost-effective reasoning model.',
    category: 'reasoning',
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },
  {
    value: 'o3-mini',
    label: 'o3-mini',
    description: 'Lightweight reasoning for math and logic.',
    category: 'reasoning',
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    supportsTemperature: false,
    tokenParam: 'max_completion_tokens'
  },

  // ── Legacy ────────────────────────────────────────────────────────────────
  {
    value: 'gpt-4-turbo',
    label: 'GPT-4 Turbo',
    description: 'Previous-generation flagship (legacy).',
    category: 'legacy',
    inputPer1M: 10.0,
    outputPer1M: 30.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gpt-3.5-turbo',
    label: 'GPT-3.5 Turbo',
    description: 'Fast and inexpensive (legacy).',
    category: 'legacy',
    inputPer1M: 0.5,
    outputPer1M: 1.5,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  }
]

export const ANTHROPIC_MODEL_CATALOG: AiModelInfo[] = [
  {
    value: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    description: 'Best balance of speed and quality for coding.',
    category: 'flagship',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'claude-opus-4-5',
    label: 'Claude Opus 4.5',
    description: 'Highest-capability Claude for complex agent work.',
    category: 'flagship',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: 'Fast and inexpensive Claude for everyday tasks.',
    category: 'efficient',
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  }
]

export const GEMINI_MODEL_CATALOG: AiModelInfo[] = [
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Fast multimodal model for chat and coding.',
    category: 'efficient',
    inputPer1M: 0.3,
    outputPer1M: 2.5,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Higher-quality Gemini for reasoning-heavy work.',
    category: 'flagship',
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Previous Flash generation.',
    category: 'efficient',
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  }
]

export const DEEPSEEK_MODEL_CATALOG: AiModelInfo[] = [
  {
    value: 'deepseek-chat',
    label: 'DeepSeek Chat',
    description: 'DeepSeek-V3 general chat and coding model.',
    category: 'efficient',
    inputPer1M: 0.28,
    outputPer1M: 0.42,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    description: 'DeepSeek-R1 reasoning model.',
    category: 'reasoning',
    inputPer1M: 0.55,
    outputPer1M: 2.19,
    supportsTemperature: false,
    tokenParam: 'max_tokens'
  }
]

export const OPENROUTER_MODEL_CATALOG: AiModelInfo[] = [
  {
    value: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini (OpenRouter)',
    description: 'OpenAI mini via OpenRouter.',
    category: 'efficient',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5 (OpenRouter)',
    description: 'Claude via OpenRouter.',
    category: 'flagship',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (OpenRouter)',
    description: 'Gemini via OpenRouter.',
    category: 'efficient',
    inputPer1M: 0.3,
    outputPer1M: 2.5,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  },
  {
    value: 'deepseek/deepseek-chat',
    label: 'DeepSeek Chat (OpenRouter)',
    description: 'DeepSeek via OpenRouter.',
    category: 'efficient',
    inputPer1M: 0.28,
    outputPer1M: 0.42,
    supportsTemperature: true,
    tokenParam: 'max_tokens'
  }
]

/** Default model used for background generation tasks and as a safe fallback. */
export const DEFAULT_AI_MODEL = 'gpt-4o-mini'
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5'
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini'

/** Simple `{ value, label }` list for `<select>` pickers. */
export const AI_MODELS = AI_MODEL_CATALOG.map(({ value, label }) => ({ value, label }))

const MODEL_INDEX: Record<string, AiModelInfo> = Object.fromEntries(
  [
    ...AI_MODEL_CATALOG,
    ...ANTHROPIC_MODEL_CATALOG,
    ...GEMINI_MODEL_CATALOG,
    ...DEEPSEEK_MODEL_CATALOG,
    ...OPENROUTER_MODEL_CATALOG
  ].map((m) => [m.value, m])
)

export function catalogForCloudProvider(id: CloudProviderId): AiModelInfo[] {
  switch (id) {
    case 'anthropic':
      return ANTHROPIC_MODEL_CATALOG
    case 'gemini':
      return GEMINI_MODEL_CATALOG
    case 'deepseek':
      return DEEPSEEK_MODEL_CATALOG
    case 'openrouter':
      return OPENROUTER_MODEL_CATALOG
    default:
      return AI_MODEL_CATALOG
  }
}

export function getModelInfo(model: string): AiModelInfo | undefined {
  return MODEL_INDEX[model]
}

export function getModelLabel(model: string): string {
  return MODEL_INDEX[model]?.label ?? model
}

export function modelSupportsTemperature(model: string): boolean {
  return MODEL_INDEX[model]?.supportsTemperature ?? true
}

export function modelTokenParam(model: string): 'max_tokens' | 'max_completion_tokens' {
  return MODEL_INDEX[model]?.tokenParam ?? 'max_tokens'
}

/** Estimated USD cost for a single request given its token counts. */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const info = MODEL_INDEX[model]
  if (!info) return 0
  const input = (promptTokens / 1_000_000) * info.inputPer1M
  const output = (completionTokens / 1_000_000) * info.outputPer1M
  return input + output
}
