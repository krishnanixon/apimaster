import { createWriteStream, existsSync, promises as fs } from 'fs'
import type { IncomingMessage } from 'http'
import { get } from 'https'
import { join } from 'path'
import { app } from 'electron'
import type { VoiceLocalModelId, VoiceLocalModelStatus } from '@shared/types/voice-assistant'
import { ensureWhisperEngine, isWhisperEngineReady } from './stt/whisper-engine'

const WHISPER_MODELS = {
  'whisper-base.en': {
    label: 'Whisper base.en',
    filename: 'ggml-base.en.bin',
    sizeBytes: 142 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'
  },
  'whisper-small': {
    label: 'Whisper small',
    filename: 'ggml-small.bin',
    sizeBytes: 466 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  }
} as const

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const KOKORO_SIZE = 330 * 1024 * 1024

type DownloadState = { progress: number | null; controller: AbortController; error?: string }

class VoiceModelManager {
  private downloads = new Map<VoiceLocalModelId, DownloadState>()

  root(): string {
    return join(app.getPath('userData'), 'voice-models')
  }

  whisperRoot(): string {
    return join(this.root(), 'whisper')
  }

  whisperPath(model: 'base.en' | 'small'): string {
    const id = model === 'small' ? 'whisper-small' : 'whisper-base.en'
    return join(this.whisperRoot(), WHISPER_MODELS[id].filename)
  }

  kokoroRoot(): string {
    return join(this.root(), 'kokoro')
  }

  async status(): Promise<VoiceLocalModelStatus[]> {
    const engineReady = isWhisperEngineReady()
    const whisper = (Object.keys(WHISPER_MODELS) as Array<keyof typeof WHISPER_MODELS>).map((id) => {
      const item = WHISPER_MODELS[id]
      const download = this.downloads.get(id)
      const path = join(this.whisperRoot(), item.filename)
      return {
        id,
        label: item.label,
        sizeBytes: item.sizeBytes,
        installed: existsSync(path),
        engineReady,
        downloading: Boolean(download),
        progress: download?.progress ?? null,
        path,
        error: download?.error
      }
    })
    const kokoroDownload = this.downloads.get('kokoro-82m')
    const kokoroMarker = join(this.kokoroRoot(), 'config.json')
    return [
      ...whisper,
      {
        id: 'kokoro-82m',
        label: 'Kokoro 82M',
        sizeBytes: KOKORO_SIZE,
        installed: existsSync(kokoroMarker),
        downloading: Boolean(kokoroDownload),
        progress: kokoroDownload?.progress ?? null,
        path: this.kokoroRoot(),
        error: kokoroDownload?.error
      }
    ]
  }

  async download(id: VoiceLocalModelId): Promise<void> {
    if (this.downloads.has(id)) return
    const controller = new AbortController()
    this.downloads.set(id, { controller, progress: 0 })
    try {
      if (id === 'kokoro-82m') {
        await fs.mkdir(this.kokoroRoot(), { recursive: true })
        const { env } = await import('@huggingface/transformers')
        const { KokoroTTS } = await import('kokoro-js')
        env.cacheDir = this.kokoroRoot()
        await KokoroTTS.from_pretrained(KOKORO_MODEL, {
          dtype: 'q8',
          device: 'cpu',
          progress_callback: (update) => {
            const state = this.downloads.get(id)
            if (!state || controller.signal.aborted) return
            const value = update.status === 'progress' ? update.progress / 100 : null
            state.progress = value === null ? null : Math.max(0, Math.min(1, value))
          }
        })
        await fs.writeFile(join(this.kokoroRoot(), 'config.json'), JSON.stringify({ model: KOKORO_MODEL }))
        return
      }
      const item = WHISPER_MODELS[id]
      const destination = join(this.whisperRoot(), item.filename)
      await fs.mkdir(this.whisperRoot(), { recursive: true })
      if (!existsSync(destination)) {
        await this.downloadToFile(item.url, destination, id, controller.signal)
      }
      // Build the transcription engine now, off the main thread, rather than on first use.
      const state = this.downloads.get(id)
      if (state) state.progress = null
      await ensureWhisperEngine(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) {
        const state = this.downloads.get(id)
        if (state) state.error = error instanceof Error ? error.message : String(error)
      }
      throw error
    } finally {
      this.downloads.delete(id)
    }
  }

  cancelDownload(id: VoiceLocalModelId): void {
    this.downloads.get(id)?.controller.abort()
  }

  async remove(id: VoiceLocalModelId): Promise<void> {
    this.cancelDownload(id)
    const target = id === 'kokoro-82m' ? this.kokoroRoot() : this.whisperPath(id === 'whisper-small' ? 'small' : 'base.en')
    await fs.rm(target, { recursive: id === 'kokoro-82m', force: true })
  }

  private async downloadToFile(url: string, destination: string, id: VoiceLocalModelId, signal: AbortSignal): Promise<void> {
    const temporary = `${destination}.part`
    await fs.rm(temporary, { force: true })
    try {
      await new Promise<void>((resolve, reject) => {
        const follow = (response: IncomingMessage, currentUrl: string, redirects: number): void => {
          const location = response.headers.location
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && location) {
            if (redirects >= 10) {
              response.resume()
              reject(new Error('Model download failed: too many redirects'))
              return
            }
            response.resume()
            const nextUrl = new URL(Array.isArray(location) ? location[0] : location, currentUrl).toString()
            const nextRequest = get(nextUrl, { headers: { 'User-Agent': 'Tessarok Voice Assistant' } }, (nextResponse) => follow(nextResponse, nextUrl, redirects + 1))
            nextRequest.on('error', reject)
            nextRequest.setTimeout(30_000, () => nextRequest.destroy(new Error('Model download timed out')))
            return
          }
          if (response.statusCode !== 200) {
            response.resume()
            reject(new Error(`Model download failed (${response.statusCode ?? 'network error'})`))
            return
          }
          const total = Number(response.headers['content-length'] ?? 0)
          let received = 0
          const output = createWriteStream(temporary)
          const fail = (error: Error): void => {
            response.destroy()
            output.destroy()
            reject(error)
          }
          response.on('data', (chunk: Buffer) => {
            received += chunk.length
            const state = this.downloads.get(id)
            if (state) state.progress = total > 0 ? Math.min(1, received / total) : null
          })
          response.on('error', fail)
          output.on('error', fail)
          output.on('finish', () => output.close(() => resolve()))
          response.pipe(output)
        }
        const request = get(url, { headers: { 'User-Agent': 'Tessarok Voice Assistant' } }, (response) => follow(response, url, 0))
        request.on('error', reject)
        request.setTimeout(30_000, () => request.destroy(new Error('Model download timed out')))
        signal.addEventListener('abort', () => request.destroy(new Error('Model download cancelled')), { once: true })
      })
      if (signal.aborted) throw new Error('Model download cancelled')
      await fs.rename(temporary, destination)
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
  }
}

export const voiceModelManager = new VoiceModelManager()
