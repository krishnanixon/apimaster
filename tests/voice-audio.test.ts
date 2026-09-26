import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let audioInstances: FakeAudio[]
class FakeAudio {
  volume = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor() {
    audioInstances.push(this)
  }
}
class FakeUtterance {
  rate = 1
  volume = 1
  voice = null
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  constructor(public text: string) {}
}
let speech: {
  getVoices: ReturnType<typeof vi.fn>
  speak: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}
let tts: typeof import('@/modules/voice-assistant/core/systemTts')
beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  audioInstances = []
  speech = {
    getVoices: vi.fn().mockReturnValue([{ name: 'Hindi', voiceURI: 'hi', lang: 'hi-IN' }]),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
  vi.stubGlobal('window', { speechSynthesis: speech, setTimeout, clearTimeout })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('Audio', FakeAudio)
  tts = await import('@/modules/voice-assistant/core/systemTts')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('speech playback', () => {
  it('honors speed, volume, and the selected language', async () => {
    const playback = tts.speakWithSystemTts('Namaste', {
      speed: 1.8,
      volume: 0.4,
      language: 'hi-IN'
    })
    await Promise.resolve()
    const utterance = speech.speak.mock.calls[0][0]
    expect(utterance).toMatchObject({
      rate: 1.8,
      volume: 0.4,
      lang: 'hi-IN',
      voice: { name: 'Hindi' }
    })
    utterance.onend()
    await playback
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles stopped system speech even when the browser sends no end event', async () => {
    const playback = tts.speakWithSystemTts('Long response', {})
    await Promise.resolve()
    tts.stopSystemSpeech()
    await playback
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start speaking after being stopped while waiting for voices', async () => {
    speech.getVoices.mockReturnValue([])
    const playback = tts.speakWithSystemTts('Do not play', {})
    tts.stopSystemSpeech()
    await vi.advanceTimersByTimeAsync(200)
    await playback
    expect(speech.speak).not.toHaveBeenCalled()
  })

  it('stops cloud audio and releases its URL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const playback = tts.playAudioBase64('YXVkaW8=', 'audio/mpeg', 0.25)
    expect(audioInstances[0].volume).toBe(0.25)
    tts.stopSystemSpeech()
    await playback
    expect(audioInstances[0].pause).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledOnce()
    revoke.mockRestore()
  })

  it('replaces playing cloud audio without leaving the first clip running', async () => {
    const first = tts.playAudioBase64('YQ==', 'audio/mpeg')
    const second = tts.playAudioBase64('Yg==', 'audio/mpeg')
    await first
    expect(audioInstances[0].pause).toHaveBeenCalledOnce()
    audioInstances[1].onended!()
    await second
  })
})

describe('microphone ownership', () => {
  it('releases a microphone granted after the recorder was cancelled', async () => {
    let grant!: (stream: unknown) => void
    const permission = new Promise((resolve) => {
      grant = resolve
    })
    const stop = vi.fn()
    const track = { stop, applyConstraints: vi.fn().mockResolvedValue(undefined) }
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockReturnValue(permission) }
    })
    vi.stubGlobal('MediaRecorder', class {})
    const { AudioRecorder } = await import('@/modules/voice-assistant/core/audioRecorder')
    const recorder = new AudioRecorder()
    const starting = recorder.start()
    recorder.cleanup()
    grant({ getAudioTracks: () => [track], getTracks: () => [track] })
    await expect(starting).rejects.toMatchObject({ name: 'AbortError' })
    expect(stop).toHaveBeenCalledOnce()
  })
})
