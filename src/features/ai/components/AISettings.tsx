import { useCallback, useEffect, useState } from 'react'
import {
  Cloud,
  Cpu,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Zap,
  Terminal,
  Copy
} from 'lucide-react'
import { toast } from 'sonner'
import { useAIStore } from '@/features/ai/stores/ai.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { AI_MODELS, cn } from '@/shared/lib/utils'
import {
  ANTHROPIC_MODEL_CATALOG,
  DEEPSEEK_MODEL_CATALOG,
  GEMINI_MODEL_CATALOG,
  OPENROUTER_MODEL_CATALOG,
  getModelInfo
} from '@shared/lib/ai-models'
import { MODE_META, PROVIDER_ICON, formatBytes, formatMs, formatTokens } from '../lib/provider-meta'
import type { AIProviderId, ApiKeyStatus, CloudProviderId } from '@shared/types'

const SELECT_CLASS =
  'flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-soft transition-[border-color,box-shadow] focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15'

const CLOUD_PROVIDER_META: Array<{
  id: CloudProviderId
  label: string
  note: string
  placeholder: string
}> = [
  { id: 'openai', label: 'OpenAI', note: 'GPT family', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', note: 'Claude', placeholder: 'sk-ant-...' },
  { id: 'gemini', label: 'Gemini', note: 'Google AI', placeholder: 'AIza...' },
  { id: 'deepseek', label: 'DeepSeek', note: 'V3 / R1', placeholder: 'sk-...' },
  { id: 'openrouter', label: 'OpenRouter', note: 'One key, many models', placeholder: 'sk-or-...' }
]

const FUTURE_PROVIDERS: { id: AIProviderId; label: string; note: string }[] = [
  { id: 'azure', label: 'Azure OpenAI', note: 'Enterprise OpenAI deployment' },
  { id: 'groq', label: 'Groq', note: 'Ultra-low-latency inference' }
]

const PROVIDER_MODELS: Partial<Record<CloudProviderId, Array<{ value: string; label: string }>>> = {
  anthropic: ANTHROPIC_MODEL_CATALOG.map((m) => ({ value: m.value, label: m.label })),
  gemini: GEMINI_MODEL_CATALOG.map((m) => ({ value: m.value, label: m.label })),
  deepseek: DEEPSEEK_MODEL_CATALOG.map((m) => ({ value: m.value, label: m.label })),
  openrouter: OPENROUTER_MODEL_CATALOG.map((m) => ({ value: m.value, label: m.label }))
}

export function AISettings() {
  const {
    config,
    isSwitching,
    loadStatus,
    setConfig,
    setMode,
    selectCloudProvider,
    testConnection,
    getProvider,
    getMetric
  } = useAIStore()
  const {
    settings,
    apiKeyStatus,
    providerKeyStatuses,
    setApiKey,
    deleteApiKey,
    setProviderKey,
    deleteProviderKey,
    loadApiKeyStatus,
    loadSettings,
    updateSettings
  } = useSettingsStore()

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void loadStatus()
    void loadApiKeyStatus()
    void loadSettings()
  }, [loadStatus, loadApiKeyStatus, loadSettings])

  useEffect(() => {
    if (config?.ollama.baseUrl) setBaseUrlInput(config.ollama.baseUrl)
  }, [config?.ollama.baseUrl])

  const openai = getProvider('openai')
  const ollama = getProvider('ollama')
  const ollamaMetric = getMetric('ollama')
  const ollamaModels = ollama?.models ?? []
  const openaiModels = openai?.models ?? []

  const model = settings?.aiModel ?? config?.openai.model ?? 'gpt-4o-mini'
  const temperature = settings?.temperature ?? config?.openai.temperature ?? 0.7
  const maxTokens = settings?.maxTokens ?? config?.openai.maxTokens ?? 4096

  const syncDefaults = useCallback(
    async (patch: { aiModel?: string; temperature?: number; maxTokens?: number }) => {
      if (settings) {
        await updateSettings({ ...settings, ...patch })
      }
      await setConfig({
        openai: {
          ...(patch.aiModel !== undefined ? { model: patch.aiModel } : {}),
          ...(patch.temperature !== undefined ? { temperature: patch.temperature } : {}),
          ...(patch.maxTokens !== undefined ? { maxTokens: patch.maxTokens } : {})
        }
      })
    },
    [settings, updateSettings, setConfig]
  )

  const handleModeChange = async (mode: NonNullable<typeof config>['mode']) => {
    if (config?.mode === mode) return
    await setMode(mode)
    toast.success(`Routing set to ${MODE_META.find((m) => m.id === mode)?.label ?? mode}`)
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    const ok = await setApiKey(apiKeyInput.trim())
    if (ok) {
      setApiKeyInput('')
      toast.success('API key saved')
      void loadStatus()
    } else {
      toast.error('Failed to save API key')
    }
  }

  const handleTestOllama = async () => {
    setTesting(true)
    if (config && baseUrlInput.trim() && baseUrlInput.trim() !== config.ollama.baseUrl) {
      await setConfig({ ollama: { baseUrl: baseUrlInput.trim() } })
    }
    const result = await testConnection('ollama')
    setTesting(false)
    if (result?.ok) {
      toast.success(
        `Ollama connected${result.version ? ` (v${result.version})` : ''} · ${result.models?.length ?? 0} models`
      )
    } else {
      toast.error(result?.detail ?? 'Could not reach Ollama')
    }
  }

  const handleRefreshModels = async () => {
    setTesting(true)
    await testConnection('ollama')
    setTesting(false)
  }

  const modelInfo = getModelInfo(model)

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Routing mode</h4>
          </div>
          {isSwitching && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Applying…
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Controls which provider handles chat, generation, and other AI requests.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {MODE_META.map((mode) => {
            const Icon = mode.icon
            const selected = config?.mode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                disabled={isSwitching}
                onClick={() => void handleModeChange(mode.id)}
                className={cn(
                  'rounded-xl border px-3 py-3 text-left transition-all',
                  selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/15'
                    : 'border-border/60 hover:border-border hover:bg-accent/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')}
                  />
                  <span className={cn('text-sm font-semibold', selected && 'text-primary')}>
                    {mode.label}
                  </span>
                  {selected && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {mode.description}
                </p>
              </button>
            )
          })}
        </div>
        {(config?.mode === 'openai' || config?.mode === 'hybrid') && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">Cloud provider</p>
            <div className="flex flex-wrap gap-1.5">
              {CLOUD_PROVIDER_META.map((provider) => {
                const selected = (config.cloudProvider ?? 'openai') === provider.id
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      void selectCloudProvider(provider.id)
                      toast.success(`Cloud provider: ${provider.label}`)
                    }}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 font-medium text-primary'
                        : 'border-border/60 text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {provider.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h4 className="text-sm font-semibold">Defaults</h4>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Used for chat, documents, and flows. Changes save automatically.
        </p>
        <div className="mt-4 space-y-4">
          <Field label="OpenAI model">
            <select
              className={SELECT_CLASS}
              value={model}
              onChange={(e) => void syncDefaults({ aiModel: e.target.value })}
            >
              {(openaiModels.length > 0
                ? openaiModels.map((m) => ({ value: m.id, label: m.label }))
                : AI_MODELS
              ).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {modelInfo && (
              <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {modelInfo.description} · ${modelInfo.inputPer1M.toFixed(2)} in / $
                {modelInfo.outputPer1M.toFixed(2)} out per 1M tokens
              </p>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Temperature · ${temperature.toFixed(1)}`}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => void syncDefaults({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </Field>
            <Field label="Max tokens (connection cap)">
              <Input
                type="number"
                min={256}
                max={8192}
                value={maxTokens}
                onChange={(e) =>
                  void syncDefaults({
                    maxTokens: Math.min(8192, Math.max(256, parseInt(e.target.value) || 4096))
                  })
                }
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Applied to every AI call, including document generation. The model cannot request
                more than this per completion.
              </p>
            </Field>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Fallback & cache</h4>
        </div>
        <div className="mt-4 divide-y divide-border/60">
          <ToggleRow
            label="Automatic fallback"
            description="Retry on the other provider if the active one fails. Credit protection still blocks extra paid retries."
            checked={config?.fallbackEnabled ?? true}
            onChange={(v) => setConfig({ fallbackEnabled: v })}
          />
          <ToggleRow
            label="Prompt cache"
            description="Reuse recent identical prompts for titles and summaries."
            checked={config?.promptCacheEnabled ?? true}
            onChange={(v) => setConfig({ promptCacheEnabled: v })}
            className="pt-3"
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">API credit protection</h4>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Enforced at connection time so document generation and other AI calls cannot overspend.
        </p>
        <div className="mt-4 divide-y divide-border/60">
          <ToggleRow
            label="Credit guard"
            description="Cap max tokens, block duplicate document generates, and skip a second paid API call after a failure."
            checked={config?.creditGuardEnabled ?? true}
            onChange={(v) => setConfig({ creditGuardEnabled: v })}
          />
          <ToggleRow
            label="Allow paid fallback"
            description="If a local model fails, continue on the cloud provider. Off by default to protect API credits."
            checked={config?.allowPaidFallback ?? false}
            onChange={(v) => setConfig({ allowPaidFallback: v })}
            className="pt-3"
          />
        </div>
        <div className="mt-4">
          <Field
            label="Daily token budget"
            hint="0 means unlimited. Document generation stops when today's recorded tokens would exceed this."
          >
            <Input
              type="number"
              min={0}
              step={1000}
              value={config?.dailyTokenBudget ?? 0}
              onChange={(e) =>
                void setConfig({ dailyTokenBudget: Math.max(0, parseInt(e.target.value) || 0) })
              }
            />
          </Field>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <ProviderHeader
            icon={Cloud}
            title="OpenAI"
            online={openai?.online}
            detail={openai?.detail}
            accent="primary"
          />
          <div className="space-y-4 p-5 pt-0">
            <Field label="API key" hint={getApiKeyStorageHint(apiKeyStatus)}>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-0 flex-1"
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    apiKeyStatus?.isSet && apiKeyStatus.isReadable
                      ? '•••••••••••••• (saved)'
                      : 'sk-...'
                  }
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide' : 'Show'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim() || apiKeyStatus?.isEncryptionAvailable === false}
                >
                  Save
                </Button>
              </div>
              {apiKeyStatus?.isSet && (
                <button
                  type="button"
                  className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                  onClick={async () => {
                    await deleteApiKey()
                    toast.success('API key removed')
                    void loadStatus()
                  }}
                >
                  Remove key
                </button>
              )}
            </Field>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <ProviderHeader
            icon={Cpu}
            title="Ollama"
            online={ollama?.online}
            detail={ollama?.detail ?? 'Local models'}
            accent="emerald"
          />
          <div className="space-y-4 p-5 pt-0">
            <Field label="Base URL">
              <div className="flex gap-2">
                <Input
                  placeholder="http://localhost:11434"
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                />
                <Button size="sm" onClick={handleTestOllama} disabled={testing}>
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Test
                </Button>
              </div>
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-caption font-medium">Models</label>
                <Button variant="ghost" size="sm" onClick={handleRefreshModels} disabled={testing}>
                  <RefreshCw className={cn('h-3.5 w-3.5', testing && 'animate-spin')} />
                </Button>
              </div>

              {ollamaModels.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-muted-foreground">
                  {ollama?.online
                    ? 'No models installed yet.'
                    : 'Start Ollama, then test the connection.'}
                </p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {ollamaModels.map((m) => {
                    const selected = config?.ollama.model === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          void setConfig({ ollama: { model: m.id } })
                          toast.success(`Ollama model: ${m.label}`)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                          selected
                            ? 'border-emerald-500/50 bg-emerald-500/5'
                            : 'border-border/60 hover:bg-accent'
                        )}
                      >
                        <Cpu
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            selected ? 'text-emerald-500' : 'text-muted-foreground'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{m.label}</span>
                          {(m.description || m.sizeBytes) && (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {[m.description, formatBytes(m.sizeBytes)]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                        {selected && (
                          <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                            <Check className="h-3 w-3" />
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <details className="group rounded-lg border border-border/60 bg-muted/20">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
                <Terminal className="h-3.5 w-3.5" />
                Install a model
                <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <InstallHint />
            </details>

            {ollamaMetric && ollamaMetric.requests > 0 && (
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-center">
                <Metric label="Avg" value={formatMs(ollamaMetric.avgResponseMs)} />
                <Metric
                  label="Tok/s"
                  value={ollamaMetric.avgTokensPerSec ? `${ollamaMetric.avgTokensPerSec}` : '—'}
                />
                <Metric label="Tokens" value={formatTokens(ollamaMetric.totalTokens)} />
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {CLOUD_PROVIDER_META.filter((p) => p.id !== 'openai').map((provider) => (
          <CloudProviderCard
            key={provider.id}
            meta={provider}
            status={getProvider(provider.id)}
            keyStatus={providerKeyStatuses[provider.id] ?? null}
            model={
              provider.id === 'anthropic'
                ? config?.anthropic?.model
                : provider.id === 'gemini'
                  ? config?.gemini?.model
                  : provider.id === 'deepseek'
                    ? config?.deepseek?.model
                    : config?.openrouter?.model
            }
            models={PROVIDER_MODELS[provider.id] ?? []}
            onSaveKey={async (key) => {
              const ok = await setProviderKey(provider.id, key)
              if (ok) {
                toast.success(`${provider.label} key saved`)
                void loadStatus()
              } else toast.error('Failed to save API key')
              return ok
            }}
            onRemoveKey={async () => {
              await deleteProviderKey(provider.id)
              toast.success(`${provider.label} key removed`)
              void loadStatus()
            }}
            onSelectModel={(model) => {
              void setConfig({ [provider.id]: { model } })
              toast.success(`${provider.label} model: ${model}`)
            }}
            onTest={async () => {
              const result = await testConnection(provider.id)
              if (result?.ok) toast.success(`${provider.label} connected`)
              else toast.error(result?.detail ?? `Could not reach ${provider.label}`)
            }}
          />
        ))}
      </div>

      <details className="group rounded-xl border border-border/50">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          More providers
          <Badge variant="outline" className="font-normal">
            Coming soon
          </Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-border/50 p-4 sm:grid-cols-3">
          {FUTURE_PROVIDERS.map((p) => {
            const Icon = PROVIDER_ICON[p.id]
            return (
              <div key={p.id} className="rounded-lg border border-border/50 p-3 opacity-80">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{p.label}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{p.note}</p>
              </div>
            )
          })}
        </div>
      </details>

      <p className="text-[11px] text-muted-foreground">
        Usage and cost tracking are in the <strong>Usage</strong> tab. Provider status refreshes
        automatically.
      </p>
    </div>
  )
}

function CloudProviderCard({
  meta,
  status,
  keyStatus,
  model,
  models,
  onSaveKey,
  onRemoveKey,
  onSelectModel,
  onTest
}: {
  meta: { id: CloudProviderId; label: string; note: string; placeholder: string }
  status?: { online?: boolean; detail?: string }
  keyStatus: ApiKeyStatus | null
  model?: string
  models: Array<{ value: string; label: string }>
  onSaveKey: (key: string) => Promise<boolean>
  onRemoveKey: () => Promise<void>
  onSelectModel: (model: string) => void
  onTest: () => Promise<void>
}) {
  const [input, setInput] = useState('')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const Icon = PROVIDER_ICON[meta.id]

  return (
    <Card className="overflow-hidden">
      <ProviderHeader
        icon={Icon}
        title={meta.label}
        online={status?.online}
        detail={status?.detail ?? meta.note}
        accent="primary"
      />
      <div className="space-y-4 p-5 pt-0">
        <Field label="API key" hint={getApiKeyStorageHint(keyStatus)}>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-0 flex-1"
              type={show ? 'text' : 'password'}
              placeholder={
                keyStatus?.isSet && keyStatus.isReadable
                  ? '•••••••••••••• (saved)'
                  : meta.placeholder
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => setShow(!show)}>
              {show ? 'Hide' : 'Show'}
            </Button>
            <Button
              size="sm"
              disabled={!input.trim()}
              onClick={async () => {
                const ok = await onSaveKey(input.trim())
                if (ok) setInput('')
              }}
            >
              Save
            </Button>
          </div>
          {keyStatus?.isSet && (
            <button
              type="button"
              className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              onClick={() => void onRemoveKey()}
            >
              Remove key
            </button>
          )}
        </Field>
        <Field label="Model">
          <select
            className={SELECT_CLASS}
            value={model ?? models[0]?.value ?? ''}
            onChange={(e) => onSelectModel(e.target.value)}
          >
            {models.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Button
          size="sm"
          variant="outline"
          disabled={testing}
          onClick={async () => {
            setTesting(true)
            await onTest()
            setTesting(false)
          }}
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Test
        </Button>
      </div>
    </Card>
  )
}

function getApiKeyStorageHint(status: ApiKeyStatus | null): string {
  if (!status) return 'Required for cloud requests.'
  if (!status.isEncryptionAvailable && !status.isSet) {
    return 'Secure OS credential storage is unavailable. Persistent API-key saving is disabled.'
  }
  switch (status.storageState) {
    case 'secure':
      return 'Configured · protected by the operating-system credential store.'
    case 'legacy-secure':
      return 'Configured · legacy secure format; it will migrate automatically when used.'
    case 'legacy-plaintext':
      return status.isEncryptionAvailable
        ? 'Configured · legacy plaintext storage detected; it will migrate automatically when used.'
        : 'Configured in legacy plaintext storage. Enable secure OS credential storage, then replace this key.'
    case 'secure-storage-unavailable':
      return 'A saved key exists but secure OS credential storage is unavailable.'
    case 'unreadable':
      return 'A saved key exists but cannot be decrypted. Remove it and save the key again.'
    default:
      return 'Required for cloud requests.'
  }
}

function ProviderHeader({
  icon: Icon,
  title,
  online,
  detail,
  accent
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  online?: boolean
  detail?: string
  accent: 'primary' | 'emerald'
}) {
  return (
    <div className="flex items-center gap-3 p-5 pb-4">
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          accent === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detail ?? '—'}</p>
      </div>
      <Badge variant={online ? 'success' : 'outline'} className="shrink-0">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            online ? 'bg-emerald-500' : 'bg-muted-foreground/50'
          )}
        />
        {online ? 'Online' : 'Offline'}
      </Badge>
    </div>
  )
}

function InstallHint() {
  const commands = [
    'ollama pull qwen2.5:3b',
    'ollama pull qwen2.5-coder:3b',
    'ollama pull llama3.2',
    'ollama pull phi3'
  ]
  return (
    <div className="space-y-1 px-3 pb-3">
      {commands.map((cmd) => (
        <button
          key={cmd}
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(cmd)
            toast.success('Copied')
          }}
          className="group flex w-full items-center justify-between rounded-md bg-background px-2.5 py-1.5 font-mono text-[11px] transition-colors hover:bg-accent"
        >
          <span>{cmd}</span>
          <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      ))}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  className
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-caption font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
