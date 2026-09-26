export interface BrowserTranscript {
  text: string
  confidence?: number
}

export interface WebSpeechSttHandlers {
  onPartial?: (text: string) => void
  /** Fires whenever recognition hears anything (interim or final). */
  onSpeechActivity?: () => void
  /** Fires after a finalized phrase; useful to end a listen turn. */
  onUtteranceFinal?: (text: string) => void
  /** Speech API is present but unusable (common in Electron). Fall back to Whisper. */
  onUnavailable?: () => void
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: {
    resultIndex: number
    results: ArrayLike<{ 0: { transcript: string; confidence: number }; isFinal: boolean }>
  }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Chromium in Electron exposes SpeechRecognition but Google uploads fail (net error -2). */
export function isElectronDesktop(): boolean {
  if (typeof window === 'undefined') return false
  if (window.electronAPI) return true
  return /electron/i.test(navigator.userAgent)
}

export function isBrowserSttAvailable(): boolean {
  if (isElectronDesktop()) return false
  return getRecognitionCtor() !== null
}

export class WebSpeechStt {
  private recognition: SpeechRecognitionLike | null = null
  private finalText = ''
  private interimText = ''
  private intentionallyStopped = false
  private gotResult = false
  private restartCount = 0

  /** Starts live captions. Returns false if Chromium speech is unavailable (common in Electron). */
  start(language: string, handlers: WebSpeechSttHandlers = {}): boolean {
    if (isElectronDesktop()) return false
    const Ctor = getRecognitionCtor()
    if (!Ctor) return false
    this.finalText = ''
    this.interimText = ''
    this.intentionallyStopped = false
    this.gotResult = false
    this.restartCount = 0
    try {
      const recognition = new Ctor()
      recognition.lang = language || 'en-US'
      recognition.interimResults = true
      recognition.continuous = true
      recognition.onresult = (event) => {
        let interim = ''
        let sawSpeech = false
        let sawFinal = false
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const piece = result[0]?.transcript ?? ''
          if (!piece.trim()) continue
          sawSpeech = true
          this.gotResult = true
          if (result.isFinal) {
            this.finalText = `${this.finalText} ${piece}`.trim()
            sawFinal = true
          } else {
            interim += piece
          }
        }
        this.interimText = interim.trim()
        const display = `${this.finalText} ${this.interimText}`.trim()
        if (display) handlers.onPartial?.(display)
        if (sawSpeech) handlers.onSpeechActivity?.()
        if (sawFinal && this.finalText) handlers.onUtteranceFinal?.(this.finalText)
      }
      recognition.onerror = (event) => {
        // "no-speech" / "aborted" are normal while waiting; keep the session alive.
        if (event.error === 'no-speech' || event.error === 'aborted') return
        this.intentionallyStopped = true
        handlers.onUnavailable?.()
      }
      recognition.onend = () => {
        if (this.intentionallyStopped || !this.recognition) return
        // Restart only after real captions. Blind restarts spam failed chunked uploads in Chromium.
        if (!this.gotResult || this.restartCount >= 2) {
          this.intentionallyStopped = true
          handlers.onUnavailable?.()
          return
        }
        this.restartCount += 1
        try {
          recognition.start()
        } catch {
          this.intentionallyStopped = true
          handlers.onUnavailable?.()
        }
      }
      this.recognition = recognition
      recognition.start()
      return true
    } catch {
      this.recognition = null
      return false
    }
  }

  currentText(): string {
    return `${this.finalText} ${this.interimText}`.trim()
  }

  stop(): BrowserTranscript {
    this.intentionallyStopped = true
    try {
      this.recognition?.stop()
    } catch {
      // ignore
    }
    this.recognition = null
    // Prefer finalized text, but keep interim so a pause-end turn is not dropped.
    return { text: this.currentText() }
  }

  abort(): void {
    this.intentionallyStopped = true
    try {
      this.recognition?.abort()
    } catch {
      // ignore
    }
    this.recognition = null
    this.finalText = ''
    this.interimText = ''
  }
}
