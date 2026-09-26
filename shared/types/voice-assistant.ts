/**
 * Voice Assistant contracts shared by the renderer, preload, and main process.
 * Keep this module independent of Workbench project/knowledge types.
 */

import { DEFAULT_AI_MODEL } from '../lib/ai-models'

export type VoiceState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'THINKING' | 'SPEAKING' | 'ERROR'

export type VoiceProcessingMode = 'local' | 'cloud' | 'hybrid'

export type VoiceSTTProviderId = 'browser' | 'openai-whisper' | 'local-whisper'

export type VoiceTTSProviderId = 'system' | 'openai' | 'local'

export type VoiceAIProviderId = 'workbench' | 'openai' | 'ollama' | 'anthropic'

export type VoiceToolRiskLevel = 'read' | 'write' | 'destructive'

export type VoiceMessageRole = 'user' | 'assistant' | 'tool' | 'system'

export interface VoiceAudioPayload {
  mimeType: string
  /** Base64-encoded audio. Never persisted unless privacy.storeAudio is enabled. */
  dataBase64: string
}

export interface VoiceTranscript {
  text: string
  language?: string
  confidence?: number
  provider: VoiceSTTProviderId
}

export interface VoiceToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface VoiceToolResult {
  toolCallId: string
  name: string
  ok: boolean
  output: string
}

export interface VoiceMessage {
  id: string
  conversationId: string
  role: VoiceMessageRole
  content: string
  timestamp: string
  toolCalls?: VoiceToolCall[]
  toolResults?: VoiceToolResult[]
  metadata?: Record<string, string | number | boolean | null>
}

export interface VoiceConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: VoiceMessage[]
}

export interface VoiceConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  preview: string
  messageCount: number
}

export interface VoiceAISettings {
  provider: VoiceAIProviderId
  model: string
  temperature: number
  maxTokens: number
}

export interface VoiceSTTSettings {
  provider: VoiceSTTProviderId
  /** whisper.cpp GGML model; downloaded only from the explicit Voice settings action. */
  model: 'base.en' | 'small'
  language: string
  microphoneId: string
  autoDetectLanguage: boolean
}

export interface VoiceTTSSettings {
  provider: VoiceTTSProviderId
  /** Local Kokoro ONNX model identifier. */
  model: 'kokoro-82m'
  voice: string
  speed: number
  volume: number
}

export interface VoiceInteractionSettings {
  pushToTalkShortcut: string
  vadEnabled: boolean
  autoListen: boolean
  interruptAssistant: boolean
  silenceTimeoutMs: number
  /** High-pass, compressor, and adaptive noise gate on the microphone. */
  noiseReduction: boolean
  /** When off, every utterance is a command — no wake word required. */
  wakeWordEnabled: boolean
  /** Show the Tess control on every page. */
  showFloatingIcon: boolean
  /** Tess is switched on — start listening in the background when the app opens. */
  autoStart: boolean
}

export interface VoicePrivacySettings {
  storeConversations: boolean
  storeAudio: boolean
  preferLocalProcessing: boolean
  /** Copy the assistant's final answer after a completed turn. */
  autoCopyResponses: boolean
}

export interface VoiceRagSettings {
  /** When on, Tess retrieves project knowledge (Vector DB RAG when indexed). */
  enabled: boolean
}

export interface VoiceMemorySettings {
  /** When on, Tess stores and recalls spoken facts in the local database. */
  enabled: boolean
}

export interface VoiceAssistantSettings {
  ai: VoiceAISettings
  stt: VoiceSTTSettings
  tts: VoiceTTSSettings
  voice: VoiceInteractionSettings
  privacy: VoicePrivacySettings
  rag: VoiceRagSettings
  memory: VoiceMemorySettings
  /** Write-risk tools the user has marked as trusted (skip confirmation). */
  trustedWriteTools: string[]
}

export type VoiceLocalModelId = 'whisper-base.en' | 'whisper-small' | 'kokoro-82m'

export interface VoiceLocalModelStatus {
  id: VoiceLocalModelId
  label: string
  sizeBytes: number
  installed: boolean
  downloading: boolean
  progress: number | null
  path: string
  error?: string
  /** Whisper only: whether the whisper.cpp engine needed to run the model is built. */
  engineReady?: boolean
}

export type VoiceAssistantSettingsPatch = {
  ai?: Partial<VoiceAISettings>
  stt?: Partial<VoiceSTTSettings>
  tts?: Partial<VoiceTTSSettings>
  voice?: Partial<VoiceInteractionSettings>
  privacy?: Partial<VoicePrivacySettings>
  rag?: Partial<VoiceRagSettings>
  memory?: Partial<VoiceMemorySettings>
  trustedWriteTools?: string[]
}

export interface VoicePendingConfirmation {
  requestId: string
  conversationId: string
  toolName: string
  description: string
  riskLevel: VoiceToolRiskLevel
  input: Record<string, unknown>
  message: string
}

export interface VoiceTurnResult {
  conversationId: string
  userMessage: VoiceMessage
  assistantMessage: VoiceMessage
  transcript: VoiceTranscript
  processingMode: VoiceProcessingMode
  pendingConfirmation?: VoicePendingConfirmation
}

export interface VoiceSynthesizeResult {
  provider: VoiceTTSProviderId
  /** When provider is `system` and `handled` is false, the renderer should speak this text locally. */
  text: string
  audioBase64?: string
  mimeType?: string
  handled?: boolean
}

export interface VoiceRuntimeStatus {
  state: VoiceState
  processingMode: VoiceProcessingMode
  error?: VoiceUserError | null
  activeConversationId: string | null
  cloudProcessing: boolean
}

export interface VoiceUserError {
  code: VoiceErrorCode
  message: string
}

export type VoiceErrorCode =
  | 'mic-permission-denied'
  | 'mic-unavailable'
  | 'mic-disconnected'
  | 'recording-failed'
  | 'stt-empty'
  | 'stt-timeout'
  | 'stt-unavailable'
  | 'stt-invalid-key'
  | 'stt-network'
  | 'ai-timeout'
  | 'ai-rate-limit'
  | 'ai-invalid-key'
  | 'ai-model-unavailable'
  | 'ai-context-too-large'
  | 'ai-provider-failure'
  | 'tts-voice-unavailable'
  | 'tts-device-unavailable'
  | 'tts-playback-failed'
  | 'tool-denied'
  | 'tool-failed'
  | 'cancelled'
  | 'unknown'

export interface VoiceEngineEvent {
  type:
    | 'state'
    | 'partial-transcript'
    | 'response-chunk'
    | 'tool-confirmation'
    | 'turn-complete'
    | 'error'
  state?: VoiceState
  transcript?: string
  chunk?: string
  confirmation?: VoicePendingConfirmation
  result?: VoiceTurnResult
  error?: VoiceUserError
  cloudProcessing?: boolean
}

/** Future Workbench boundary — mock/no-op in the MVP. */
export interface CreateProjectInput {
  name: string
  description?: string
}

export interface CreateRequirementInput {
  projectId: string
  title: string
  description: string
}

export interface SearchProjectInput {
  query: string
  projectId?: string
}

export interface GenerateDocumentInput {
  projectId: string
  type: string
}

export interface WorkbenchProject {
  id: string
  name: string
}

export interface WorkbenchRequirement {
  id: string
  title: string
}

export interface WorkbenchSearchResult {
  id: string
  title: string
  snippet: string
}

export interface WorkbenchDocument {
  id: string
  title: string
}

export interface WorkbenchIntegration {
  createProject(input: CreateProjectInput): Promise<WorkbenchProject>
  createRequirement(input: CreateRequirementInput): Promise<WorkbenchRequirement>
  searchProject(input: SearchProjectInput): Promise<WorkbenchSearchResult[]>
  generateDocument(input: GenerateDocumentInput): Promise<WorkbenchDocument>
}

export const DEFAULT_VOICE_ASSISTANT_SETTINGS: VoiceAssistantSettings = {
  ai: {
    provider: 'workbench',
    model: DEFAULT_AI_MODEL,
    temperature: 0.7,
    maxTokens: 1024
  },
  stt: {
    provider: 'local-whisper',
    model: 'base.en',
    language: 'en-US',
    microphoneId: '',
    autoDetectLanguage: false
  },
  tts: {
    provider: 'local',
    model: 'kokoro-82m',
    voice: 'af_heart',
    speed: 1,
    volume: 1
  },
  voice: {
    pushToTalkShortcut: 'Control+Space',
    vadEnabled: true,
    autoListen: true,
    interruptAssistant: true,
    silenceTimeoutMs: 900,
    noiseReduction: true,
    wakeWordEnabled: true,
    showFloatingIcon: true,
    autoStart: false
  },
  privacy: {
    storeConversations: true,
    storeAudio: false,
    preferLocalProcessing: false,
    autoCopyResponses: false
  },
  rag: {
    enabled: true
  },
  memory: {
    enabled: true
  },
  trustedWriteTools: [
    'copy_to_clipboard',
    'paste_text',
    'transform_clipboard',
    'create_note',
    'remember_fact'
  ]
}

export const VOICE_STATE_LABELS: Record<VoiceState, string> = {
  IDLE: 'Ready',
  LISTENING: 'Listening…',
  PROCESSING: 'Transcribing…',
  THINKING: 'Thinking…',
  SPEAKING: 'Speaking…',
  ERROR: 'Something went wrong'
}
