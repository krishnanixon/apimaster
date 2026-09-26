import { DEFAULT_DEEPSEEK_MODEL, DEFAULT_OPENROUTER_MODEL, DEEPSEEK_MODEL_CATALOG, OPENROUTER_MODEL_CATALOG } from '@shared/lib/ai-models'
import { OpenAICompatibleProvider } from './openai-compatible.provider'

export const deepSeekProvider = new OpenAICompatibleProvider({
  id: 'deepseek',
  label: 'DeepSeek',
  baseURL: 'https://api.deepseek.com',
  catalog: DEEPSEEK_MODEL_CATALOG,
  defaultModel: DEFAULT_DEEPSEEK_MODEL
})

export const openRouterProvider = new OpenAICompatibleProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  baseURL: 'https://openrouter.ai/api/v1',
  catalog: OPENROUTER_MODEL_CATALOG,
  defaultModel: DEFAULT_OPENROUTER_MODEL,
  headers: {
    'HTTP-Referer': 'https://ai-workbench-studio.local',
    'X-Title': 'Tessarok'
  }
})
