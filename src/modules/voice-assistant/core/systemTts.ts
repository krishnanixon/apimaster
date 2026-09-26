import { splitSpeechChunks } from '../lib/speech-text'

let playbackEpoch = 0
let cancelPlayback: (() => void) | null = null

/** Stop both system speech and downloaded audio, including pending voice discovery. */
export function stopSystemSpeech(): void {
  playbackEpoch += 1
  cancelPlayback?.()
  cancelPlayback = null
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
}

export function listSystemVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return []
  return window.speechSynthesis.getVoices()
}

function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const existing = listSystemVoices()
  if (existing.length > 0) return Promise.resolve(existing)
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer)
      window.speechSynthesis?.removeEventListener('voiceschanged', done)
      resolve(listSystemVoices())
    }
    const timer = window.setTimeout(done, 180)
    window.speechSynthesis?.addEventListener('voiceschanged', done)
  })
}

export async function speakWithSystemTts(
  text: string,
  options: {
    voice?: string
    speed?: number
    volume?: number
    language?: string
    /** Fires once, when the first chunk actually starts playing. */
    onStarted?: () => void
  }
): Promise<void> {
  if (!window.speechSynthesis) throw new Error('System speech synthesis is unavailable')
  stopSystemSpeech()
  const epoch = playbackEpoch
  const voices = await waitForVoices()
  if (epoch !== playbackEpoch || !text.trim()) return

  const rate = Math.max(0.5, Math.min(2, options.speed ?? 1))
  const selected = voices.find((v) => v.name === options.voice || v.voiceURI === options.voice)
  const languageVoice = options.language
    ? (voices.find((v) => v.lang.toLowerCase() === options.language?.toLowerCase()) ??
      voices.find((v) => v.lang.split('-')[0] === options.language?.split('-')[0]))
    : undefined
  let started = false
  const markStarted = () => {
    if (started) return
    started = true
    options.onStarted?.()
  }

  // Chromium silently stops long utterances, so speak sentence-sized chunks in order.
  for (const chunk of splitSpeechChunks(text)) {
    if (epoch !== playbackEpoch) return
    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.rate = rate
      utterance.volume = Math.max(0, Math.min(1, options.volume ?? 1))
      if (options.language) utterance.lang = options.language
      if (selected || languageVoice) utterance.voice = selected ?? languageVoice ?? null
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(watchdog)
        utterance.onstart = null
        utterance.onend = null
        utterance.onerror = null
        if (cancelPlayback === cancel) cancelPlayback = null
        if (error) reject(error)
        else resolve()
      }
      const cancel = () => finish()
      cancelPlayback = cancel
      // A stalled engine must release the turn, but never report completion while still speaking.
      const watchdog = window.setTimeout(
        () => {
          finish(new Error('Speech playback timed out'))
          window.speechSynthesis.cancel()
        },
        Math.max(15000, (chunk.length * 150) / rate)
      )
      utterance.onstart = markStarted
      utterance.onend = () => finish()
      utterance.onerror = (event) =>
        finish(
          event.error === 'interrupted' || event.error === 'canceled'
            ? undefined
            : new Error('Playback failed')
        )
      try {
        window.speechSynthesis.speak(utterance)
        if (window.speechSynthesis.paused) window.speechSynthesis.resume()
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Playback failed'))
      }
    })
  }
  // Some engines never fire onstart; still release anything waiting on it.
  if (epoch === playbackEpoch) markStarted()
}

export async function playAudioBase64(
  dataBase64: string,
  mimeType: string,
  volume = 1,
  onStarted?: () => void
): Promise<void> {
  stopSystemSpeech()
  if (!dataBase64.trim()) throw new Error('The voice model returned empty audio')
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0))
  } catch {
    throw new Error('The voice model returned invalid audio data')
  }
  if (bytes.byteLength === 0) throw new Error('The voice model returned empty audio')
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mimeType || 'audio/mpeg' }))
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = Math.max(0, Math.min(1, volume))
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        audio.pause()
        audio.onended = null
        audio.onerror = null
        if (cancelPlayback === cancel) cancelPlayback = null
        if (error) reject(error)
        else resolve()
      }
      const cancel = () => finish()
      cancelPlayback = cancel
      audio.onended = () => finish()
      audio.onerror = () => {
        const code = audio.error?.code
        finish(new Error(code ? `Audio playback failed (media error ${code})` : 'Audio playback failed'))
      }
      audio.load?.()
      void audio.play().then(
        () => onStarted?.(),
        (error: unknown) => finish(error instanceof Error ? error : new Error('Audio playback failed'))
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
