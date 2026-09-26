import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import type { TTSProvider, TTSSpeakResult } from '../TTSProvider'
import { voiceModelManager } from '../../model-manager'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

async function ensureVoiceAsset(voice: string): Promise<void> {
  // kokoro-js resolves voice files relative to its bundled runtime. In an
  // electron-vite build that runtime can live under out/main, so make the
  // asset available at the path the library expects as well.
  const target = join(__dirname, '..', 'voices', `${voice}.bin`)
  try {
    await fs.access(target)
    return
  } catch {
    // The build-copy step normally handles this. This keeps dev builds and
    // older installations self-healing.
  }

  const packageEntry = require.resolve('kokoro-js')
  const source = join(dirname(packageEntry), '..', 'voices', `${voice}.bin`)
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.copyFile(source, target)
}

export class KokoroTTSProvider implements TTSProvider {
  readonly id = 'local' as const
  private abort: AbortController | null = null
  private runtime: ReturnType<KokoroTTSProvider['load']> | null = null

  async speak(
    text: string,
    options: { voice?: string; speed?: number; volume?: number; signal?: AbortSignal }
  ): Promise<TTSSpeakResult> {
    const marker = join(voiceModelManager.kokoroRoot(), 'config.json')
    try {
      await fs.access(marker)
    } catch {
      throw new Error('Kokoro is not installed. Download it from Voice settings.')
    }
    this.stop()
    const operation = new AbortController()
    this.abort = operation
    const cancel = () => operation.abort()
    if (options.signal?.aborted) cancel()
    else options.signal?.addEventListener('abort', cancel, { once: true })
    try {
      operation.signal.throwIfAborted()
      let tts
      try {
        tts = await (this.runtime ??= this.load())
      } catch (error) {
        // Allow a retry after a transient model/cache/ONNX failure.
        this.runtime = null
        throw error
      }
      const voice = options.voice || 'af_heart'
      await ensureVoiceAsset(voice)
      const audio = await tts.generate(text.trim(), {
        voice: voice as 'af_heart',
        speed: options.speed ?? 1
      })
      operation.signal.throwIfAborted()
      const bytes = new Uint8Array(audio.toWav())
      return { provider: this.id, text, audioBase64: Buffer.from(bytes).toString('base64'), mimeType: 'audio/wav' }
    } finally {
      options.signal?.removeEventListener('abort', cancel)
      if (this.abort === operation) this.abort = null
    }
  }

  stop(): void {
    this.abort?.abort()
    this.abort = null
  }

  private async load() {
    const { env } = await import('@huggingface/transformers')
    const { KokoroTTS } = await import('kokoro-js')
    env.cacheDir = voiceModelManager.kokoroRoot()
    env.allowRemoteModels = false
    return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' })
  }
}

export const kokoroTTSProvider = new KokoroTTSProvider()
