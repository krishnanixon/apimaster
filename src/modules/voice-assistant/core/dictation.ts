import type { VoiceAssistantSettings } from '@shared/types/voice-assistant'
import { classifySttError, voiceUserError } from '@shared/lib/voice-errors'
import { AudioRecorder, blobToBase64 } from './audioRecorder'
import { createNoiseGate, createTurnDetector } from './vad'

const VOICE_RMS = 0.018

export interface DictationHandlers {
  /** 0–1 microphone level, sampled every animation frame while recording. */
  onLevel?: (level: number) => void
  /** Fires once when the speaker pauses after talking (only with `autoStop`). */
  onSilence?: () => void
}

/**
 * One-shot speech capture for text inputs (chat composer, Tess quick ask).
 * Records from the configured microphone and transcribes with the same STT engine
 * Tess uses, so dictation and the voice assistant always share one setup.
 */
export class Dictation {
  private recorder: AudioRecorder | null = null
  private raf: number | null = null
  private cancelled = false

  get active(): boolean {
    return this.recorder !== null
  }

  async start(
    settings: VoiceAssistantSettings,
    options: { autoStop?: boolean } & DictationHandlers = {}
  ): Promise<void> {
    this.cancel()
    this.cancelled = false
    const recorder = new AudioRecorder()
    this.recorder = recorder
    await recorder.start(settings.stt.microphoneId || undefined, {
      noiseReduction: settings.voice.noiseReduction !== false
    })
    if (this.cancelled || this.recorder !== recorder) {
      recorder.cleanup()
      return
    }

    const gate = createNoiseGate({ minThreshold: VOICE_RMS })
    const turn = createTurnDetector({
      silenceMs: settings.voice.silenceTimeoutMs,
      minSpeechMs: 320,
      maxMs: 60000
    })
    let last = performance.now()
    let silenced = false
    const tick = (now: number) => {
      if (this.recorder !== recorder) return
      const dt = Math.min(120, now - last)
      last = now
      const rms = recorder.rms()
      options.onLevel?.(Math.min(1, rms * 10))
      if (options.autoStop && !silenced) {
        const speech =
          settings.voice.noiseReduction !== false ? gate.sample(rms).isSpeech : rms >= VOICE_RMS
        if (turn.sample(speech, dt) === 'end') {
          silenced = true
          options.onSilence?.()
        }
      }
      this.raf = window.requestAnimationFrame(tick)
    }
    this.raf = window.requestAnimationFrame(tick)
  }

  /** Stops recording and returns the transcript ('' when nothing was said). */
  async stop(): Promise<string> {
    const recorder = this.recorder
    this.stopLoop()
    this.recorder = null
    if (!recorder) return ''
    const blob = await recorder.stop()
    if (this.cancelled || !blob || blob.size < 256) return ''
    const voice = window.electronAPI?.voice
    if (!voice?.transcribe) throw voiceUserError('stt-unavailable')
    const res = await voice.transcribe({
      mimeType: blob.type || 'audio/webm',
      dataBase64: await blobToBase64(blob)
    })
    if (this.cancelled) return ''
    if (!res.success || !res.data) {
      throw classifySttError(new Error(res.error ?? 'Speech recognition is unavailable'))
    }
    return res.data.text.trim()
  }

  cancel(): void {
    this.cancelled = true
    this.stopLoop()
    this.recorder?.cleanup()
    this.recorder = null
  }

  private stopLoop(): void {
    if (this.raf !== null) window.cancelAnimationFrame(this.raf)
    this.raf = null
  }
}
