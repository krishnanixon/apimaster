export interface MicrophoneDevice {
  deviceId: string
  label: string
}

export async function listMicrophones(): Promise<MicrophoneDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${index + 1}`
    }))
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

type CaptureOptions = {
  noiseReduction?: boolean
}

function audioConstraints(
  deviceId: string | undefined,
  noiseReduction: boolean
): MediaTrackConstraints {
  const processing: MediaTrackConstraints = {
    channelCount: { ideal: 1 },
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    sampleRate: { ideal: 48000 }
  }
  if (deviceId) processing.deviceId = { ideal: deviceId }
  if (noiseReduction) {
    Object.assign(processing, {
      googEchoCancellation: true,
      googNoiseSuppression: true,
      googNoiseSuppression2: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
      googAutoGainControl: true,
      googAutoGainControl2: true
    })
  }
  return processing
}

async function getMicrophoneStream(
  deviceId: string | undefined,
  noiseReduction: boolean
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Microphone API is unavailable', 'NotSupportedError')
  }

  const attempts: MediaStreamConstraints[] = [
    { audio: audioConstraints(deviceId, noiseReduction) },
    {
      audio: {
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    },
    { audio: true }
  ]

  let lastError: unknown
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const track = stream.getAudioTracks()[0]
      if (track && noiseReduction) {
        void track
          .applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          })
          .catch(() => undefined)
      }
      return stream
    } catch (error) {
      lastError = error
      if (error instanceof DOMException && error.name === 'NotAllowedError') throw error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new DOMException('Microphone unavailable', 'NotFoundError')
}

export class AudioRecorder {
  private generation = 0
  private media: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private analyser: AnalyserNode | null = null
  private audioContext: AudioContext | null = null
  private gate: GainNode | null = null
  private gateTimer: number | null = null
  private processed: MediaStream | null = null

  async start(deviceId?: string, options: CaptureOptions = {}): Promise<void> {
    this.cleanup()
    const generation = this.generation
    this.chunks = []
    if (typeof MediaRecorder === 'undefined') {
      throw new DOMException('This app cannot record audio on this device', 'NotSupportedError')
    }

    const noiseReduction = options.noiseReduction !== false
    const media = await getMicrophoneStream(deviceId, noiseReduction)
    if (generation !== this.generation) {
      media.getTracks().forEach((track) => track.stop())
      throw new DOMException('Recording cancelled', 'AbortError')
    }
    this.media = media

    let recordStream = this.media
    try {
      recordStream = await this.connectGraph(this.media, noiseReduction)
    } catch {
      this.analyser = null
      this.gate = null
    }

    if (generation !== this.generation) {
      throw new DOMException('Recording cancelled', 'AbortError')
    }
    const mimeType = pickRecorderMimeType()
    const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {}
    if (mimeType?.includes('opus') || mimeType?.includes('webm')) {
      recorderOptions.audioBitsPerSecond = 64000
    }
    this.recorder = new MediaRecorder(recordStream, recorderOptions)
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    try {
      this.recorder.start(250)
    } catch {
      this.recorder.start()
    }
  }

  private async connectGraph(input: MediaStream, noiseReduction: boolean): Promise<MediaStream> {
    this.audioContext = new AudioContext()
    if (this.audioContext.state === 'suspended') {
      const context = this.audioContext
      await context.resume().catch(() => undefined)
      if (this.audioContext !== context) throw new DOMException('Recording cancelled', 'AbortError')
    }

    const source = this.audioContext.createMediaStreamSource(input)

    // Focus on speech band; roll off rumble and hiss that background sources often carry.
    const highpass = this.audioContext.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = noiseReduction ? 140 : 60
    highpass.Q.value = 0.85

    const lowpass = this.audioContext.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = noiseReduction ? 4800 : 9000
    lowpass.Q.value = 0.7

    // Mild presence boost around typical speech formants.
    const presence = this.audioContext.createBiquadFilter()
    presence.type = 'peaking'
    presence.frequency.value = 1800
    presence.Q.value = 0.85
    presence.gain.value = noiseReduction ? 2.5 : 1

    const compressor = this.audioContext.createDynamicsCompressor()
    compressor.threshold.value = noiseReduction ? -24 : -16
    compressor.knee.value = 10
    compressor.ratio.value = noiseReduction ? 3 : 2
    compressor.attack.value = 0.004
    compressor.release.value = 0.2

    this.gate = this.audioContext.createGain()
    this.gate.gain.value = 1

    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.5

    const destination = this.audioContext.createMediaStreamDestination()

    source.connect(highpass)
    highpass.connect(lowpass)
    lowpass.connect(presence)
    presence.connect(compressor)
    compressor.connect(this.analyser)
    this.analyser.connect(this.gate)
    this.gate.connect(destination)

    this.processed = destination.stream
    if (noiseReduction) this.startGate()
    return destination.stream
  }

  private startGate(): void {
    this.stopGate()
    if (!this.analyser || !this.gate || !this.audioContext) return

    let floor = 0.01
    let openCount = 0
    let hangover = 0
    let calibrated = 0
    const tick = () => {
      if (!this.analyser || !this.gate || !this.audioContext) return
      const rms = this.rms()
      if (calibrated < 8) {
        calibrated += 1
        floor = Math.min(0.028, Math.max(0.003, floor * 0.7 + rms * 0.3))
        this.gateTimer = window.setTimeout(tick, 35)
        return
      }
      const threshold = Math.max(0.02, floor * 3.6)
      const candidate = rms >= threshold
      if (candidate) {
        openCount += 1
        floor = Math.min(0.028, floor * 0.997 + Math.min(rms, threshold) * 0.003)
      } else {
        openCount = 0
        floor = Math.min(0.028, Math.max(0.003, floor * 0.92 + rms * 0.08))
      }
      if (openCount >= 2) hangover = 6
      else if (hangover > 0) hangover -= 1
      const open = openCount >= 2 || hangover > 0
      // Soft duck for background; full open for speech.
      const target = open ? 1 : 0.08
      const now = this.audioContext.currentTime
      this.gate.gain.cancelScheduledValues(now)
      this.gate.gain.setTargetAtTime(target, now, open ? 0.015 : 0.06)
      this.gateTimer = window.setTimeout(tick, 35)
    }
    tick()
  }

  private stopGate(): void {
    if (this.gateTimer != null) {
      window.clearTimeout(this.gateTimer)
      this.gateTimer = null
    }
  }

  isSpeech(threshold = 0.022): boolean {
    return this.rms() >= threshold
  }

  rms(): number {
    if (!this.analyser) return 0
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const sample of data) {
      const centered = (sample - 128) / 128
      sum += centered * centered
    }
    return Math.sqrt(sum / data.length)
  }

  bands(count = 22): number[] {
    if (!this.analyser) return Array.from({ length: count }, () => 0)
    const buffer = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(buffer)
    const usable = Math.max(count, Math.floor(buffer.length * 0.55))
    const slice = Math.max(1, Math.floor(usable / count))
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      let sum = 0
      const offset = 1 + i * slice
      for (let j = 0; j < slice; j++) sum += buffer[offset + j] ?? 0
      out.push(Math.min(1, sum / slice / 180))
    }
    return out
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder
    try {
      return await new Promise<Blob>((resolve, reject) => {
        if (!recorder) {
          reject(new Error('Recorder is not running'))
          return
        }
        recorder.onstop = () => {
          resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }))
        }
        recorder.onerror = () => reject(new Error('Recording failed'))
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }))
      })
    } finally {
      this.cleanup()
    }
  }

  cleanup(): void {
    this.generation += 1
    this.stopGate()
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      // already stopped
    }
    this.recorder = null
    this.chunks = []
    this.analyser = null
    this.gate = null
    this.processed?.getTracks().forEach((track) => track.stop())
    this.processed = null
    void this.audioContext?.close().catch(() => undefined)
    this.audioContext = null
    this.media?.getTracks().forEach((track) => track.stop())
    this.media = null
  }
}
