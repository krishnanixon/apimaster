import type { VoiceErrorCode, VoiceUserError } from '../types/voice-assistant'

const USER_MESSAGES: Record<VoiceErrorCode, string> = {
  'mic-permission-denied':
    'Microphone access was denied. Allow it in system settings and try again.',
  'mic-unavailable': 'No microphone is available on this device.',
  'mic-disconnected': 'The microphone was disconnected.',
  'recording-failed': 'Recording failed. Check your microphone and try again.',
  'stt-empty': 'I did not catch that. Please try speaking again.',
  'stt-timeout': 'Speech recognition timed out. Please try again.',
  'stt-unavailable':
    'Speech-to-text is not ready. Open Voice settings to download a Whisper model or choose another transcription engine.',
  'stt-invalid-key': 'The speech-to-text API key is missing or invalid.',
  'stt-network': 'Could not reach the speech-to-text service. Check your connection.',
  'ai-timeout': 'The AI provider timed out. Try again in a moment.',
  'ai-rate-limit': 'The AI provider rate-limited this request. Wait a moment and retry.',
  'ai-invalid-key': 'The AI API key is missing or invalid. Add it in Settings → AI.',
  'ai-model-unavailable': 'The selected AI model is not available.',
  'ai-context-too-large': 'This conversation is too long for the model. Start a new one.',
  'ai-provider-failure': 'The AI provider could not complete the request.',
  'tts-voice-unavailable': 'The selected voice is not available.',
  'tts-device-unavailable': 'No audio output device is available.',
  'tts-playback-failed': 'Could not play the spoken response.',
  'tool-denied': 'That action was cancelled.',
  'tool-failed': 'The requested action could not be completed.',
  cancelled: 'The request was cancelled.',
  unknown: 'Something went wrong. Please try again.'
}

export function voiceUserError(code: VoiceErrorCode, _technical?: string): VoiceUserError {
  return { code, message: USER_MESSAGES[code] }
}

export function classifyProviderError(error: unknown): VoiceUserError {
  const text = error instanceof Error ? error.message : String(error)
  const lower = text.toLowerCase()
  if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401')) {
    return voiceUserError('ai-invalid-key', text)
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return voiceUserError('ai-rate-limit', text)
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return voiceUserError('ai-timeout', text)
  }
  if (lower.includes('context') && lower.includes('length')) {
    return voiceUserError('ai-context-too-large', text)
  }
  if (lower.includes('model')) {
    return voiceUserError('ai-model-unavailable', text)
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('enotfound')) {
    return voiceUserError('stt-network', text)
  }
  return voiceUserError('ai-provider-failure', text)
}

export function classifySttError(error: unknown): VoiceUserError {
  const text = error instanceof Error ? error.message : String(error)
  const lower = text.toLowerCase()
  if (lower.includes('api key') || lower.includes('401') || lower.includes('unauthorized')) {
    return voiceUserError('stt-invalid-key', text)
  }
  if (lower.includes('timeout')) return voiceUserError('stt-timeout', text)
  if (lower.includes('network') || lower.includes('fetch'))
    return voiceUserError('stt-network', text)
  if (lower.includes('empty') || lower.includes('no speech'))
    return voiceUserError('stt-empty', text)
  // Local setup problems carry their own actionable message ("Whisper base.en is not
  // installed…", "The local Whisper engine is not set up…"); show it instead of the generic one.
  if (/not installed|not set up|voice settings|cmake|whisper engine/i.test(text)) {
    return { code: 'stt-unavailable', message: text.replace(/^Error:\s*/, '') }
  }
  return voiceUserError('stt-unavailable', text)
}
