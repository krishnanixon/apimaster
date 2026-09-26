import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { cpus, tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import ffmpegStatic from 'ffmpeg-static'

/**
 * Runs local speech-to-text with async child processes: ffmpeg converts the recording
 * to 16 kHz mono WAV, then whisper.cpp's CLI transcribes it.
 *
 * nodejs-whisper's own runner is not used: it calls shelljs.exec synchronously, which
 * relaunches process.execPath — the Electron binary inside the app — and returns
 * undefined ("Cannot read properties of undefined (reading 'code')").
 */

export function ffmpegExecutablePath(): string {
  // Packaged apps must run binaries from the unpacked copy, never from inside app.asar.
  const path = typeof ffmpegStatic === 'string' ? ffmpegStatic : ''
  return path ? path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') : 'ffmpeg'
}

function run(
  command: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs: number; label: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted()
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000)
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${options.label} timed out`))
    }, options.timeoutMs)
    const abort = () => child.kill()
    options.signal?.addEventListener('abort', abort, { once: true })
    const done = () => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
    child.on('error', (error) => {
      done()
      reject(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(`${options.label} is not installed (${command} not found).`)
          : error
      )
    })
    child.on('exit', (code) => {
      done()
      if (options.signal?.aborted) {
        reject(new DOMException('Transcription cancelled', 'AbortError'))
        return
      }
      if (code === 0) resolve(stdout)
      else {
        const detail = stderr.trim().split('\n').filter(Boolean).pop() ?? `exit code ${code}`
        reject(new Error(`${options.label} failed: ${detail}`))
      }
    })
  })
}

/** Metal is only reliable on Apple Silicon; CUDA/Vulkan builds are not used here. */
function gpuSupported(): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64'
}

function whisperThreads(): number {
  return Math.max(2, Math.min(8, cpus().length - 2))
}

/** Removes whisper.cpp's non-speech annotations like "[BLANK_AUDIO]" or "(music)". */
export function cleanWhisperOutput(stdout: string): string {
  return stdout
    .split('\n')
    .map((line) => line.replace(/^\s*\[[^\]]*-->[^\]]*\]\s*/, ''))
    .join(' ')
    .replace(/\[(?:BLANK_AUDIO|MUSIC|NOISE|SOUND|silence)[^\]]*\]/gi, ' ')
    .replace(/\((?:music|silence|noise|inaudible|blank audio)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function transcribeWithWhisperCli(input: {
  audio: Buffer
  extension: string
  executable: string
  modelPath: string
  language?: string
  /** Vocabulary hint, e.g. the assistant's name, so it is spelled correctly. */
  prompt?: string
  signal?: AbortSignal
}): Promise<string> {
  const base = join(tmpdir(), `tessarok-voice-${randomUUID()}`)
  const source = `${base}.${input.extension}`
  const wav = `${base}.wav`
  await fs.writeFile(source, input.audio)
  try {
    await run(
      ffmpegExecutablePath(),
      ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav],
      { signal: input.signal, timeoutMs: 30_000, label: 'Audio conversion (ffmpeg)' }
    )
    const stdout = await run(
      input.executable,
      [
        '-m', input.modelPath,
        '-f', wav,
        '-l', input.language || 'auto',
        '-t', String(whisperThreads()),
        // Greedy decoding: noticeably faster for short voice commands, same accuracy in practice.
        '-bs', '1',
        '-bo', '1',
        '-nt',
        '-np',
        ...(input.prompt ? ['--prompt', input.prompt] : []),
        // Metal on Intel Macs returns garbled text ("," or single words); use the CPU there.
        ...(gpuSupported() ? [] : ['-ng'])
      ],
      { signal: input.signal, timeoutMs: 120_000, label: 'Whisper transcription' }
    )
    return cleanWhisperOutput(stdout)
  } finally {
    await Promise.all([
      fs.rm(source, { force: true }).catch(() => undefined),
      fs.rm(wav, { force: true }).catch(() => undefined)
    ])
  }
}
