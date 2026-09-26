import type {
  VoiceAssistantSettings,
  VoiceLocalModelId,
  VoiceLocalModelStatus
} from '../types/voice-assistant'

export type SttReadiness =
  | { ready: true; label: string; detail: string; cloud: boolean; switchTo?: undefined }
  | {
      ready: false
      label: string
      detail: string
      /** One-click fix the UI can offer. */
      action:
        | { kind: 'download'; modelId: VoiceLocalModelId; text: string }
        | { kind: 'use-installed'; model: 'base.en' | 'small'; text: string }
        | { kind: 'finish-setup'; modelId: VoiceLocalModelId; text: string }
        | { kind: 'choose-engine'; text: string }
      cloud: false
    }

const MODEL_ID = { 'base.en': 'whisper-base.en', small: 'whisper-small' } as const
const MODEL_LABEL = { 'base.en': 'Whisper base.en', small: 'Whisper small' } as const

/** Explains whether speech recognition can run with the current settings and models. */
export function sttReadiness(
  settings: VoiceAssistantSettings,
  models: VoiceLocalModelStatus[],
  options: { browserCaptionsAvailable?: boolean } = {}
): SttReadiness {
  const provider = settings.stt.provider
  if (provider === 'openai-whisper') {
    return {
      ready: true,
      label: 'OpenAI Whisper',
      detail: 'Recordings are sent to OpenAI for transcription. Requires your OpenAI API key.',
      cloud: true
    }
  }
  if (provider === 'browser' && options.browserCaptionsAvailable) {
    return { ready: true, label: 'Browser captions', detail: 'Live captions from the browser.', cloud: false }
  }

  // Local Whisper (also the desktop fallback for browser captions).
  const selected = settings.stt.model ?? 'base.en'
  const status = (model: 'base.en' | 'small') => models.find((m) => m.id === MODEL_ID[model])
  const selectedStatus = status(selected)
  const otherModel = selected === 'small' ? 'base.en' : 'small'
  const other = status(otherModel)

  if (models.length === 0) {
    return { ready: true, label: MODEL_LABEL[selected], detail: 'Checking local models…', cloud: false }
  }
  if (selectedStatus?.downloading || other?.downloading) {
    const busy = selectedStatus?.downloading ? selectedStatus : other!
    return {
      ready: false,
      label: `Setting up ${busy.label}`,
      detail:
        busy.progress === null
          ? 'Building the local speech engine. This takes a few minutes the first time.'
          : `Downloading · ${Math.round(busy.progress * 100)}%`,
      action: { kind: 'choose-engine', text: 'Use OpenAI Whisper meanwhile' },
      cloud: false
    }
  }
  if (!selectedStatus?.installed) {
    if (other?.installed) {
      return {
        ready: false,
        label: `${MODEL_LABEL[selected]} is not downloaded`,
        detail: `${MODEL_LABEL[otherModel]} is installed. Switch to it, or download ${MODEL_LABEL[selected]}.`,
        action: { kind: 'use-installed', model: otherModel, text: `Use ${MODEL_LABEL[otherModel]}` },
        cloud: false
      }
    }
    const size = selectedStatus ? ` (${Math.round(selectedStatus.sizeBytes / 1024 / 1024)} MB)` : ''
    return {
      ready: false,
      label: 'Speech recognition needs a model',
      detail: `Download ${MODEL_LABEL[selected]}${size} once. It runs on this device and audio never leaves it.`,
      action: { kind: 'download', modelId: MODEL_ID[selected], text: `Download ${MODEL_LABEL[selected]}` },
      cloud: false
    }
  }
  if (selectedStatus.engineReady === false) {
    return {
      ready: false,
      label: 'Local speech engine is not set up',
      detail: 'The model is downloaded, but the whisper.cpp engine still needs to be built on this device.',
      action: { kind: 'finish-setup', modelId: MODEL_ID[selected], text: 'Finish setup' },
      cloud: false
    }
  }
  return {
    ready: true,
    label: MODEL_LABEL[selected],
    detail: 'Runs on this device. Audio never leaves your computer.',
    cloud: false
  }
}
