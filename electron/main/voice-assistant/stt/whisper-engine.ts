import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'

/**
 * Locates and builds the whisper.cpp CLI that nodejs-whisper shells out to.
 *
 * nodejs-whisper builds the binary lazily with a synchronous cmake call on the
 * first transcription, which freezes the main process for minutes. We build it
 * asynchronously during model setup instead, and refuse to transcribe until it exists.
 */

function whisperCppRoot(): string {
  const entry = require.resolve('nodejs-whisper')
  // Packaged apps must run binaries from the unpacked copy, never from inside app.asar.
  return join(dirname(entry), '..', 'cpp', 'whisper.cpp').replace(
    `app.asar${process.platform === 'win32' ? '\\' : '/'}`,
    `app.asar.unpacked${process.platform === 'win32' ? '\\' : '/'}`
  )
}

export function whisperExecutablePath(): string | null {
  const root = whisperCppRoot()
  const name = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const candidates = [
    join(root, 'build', 'bin', name),
    join(root, 'build', 'bin', 'Release', name),
    join(root, 'build', 'bin', 'Debug', name),
    join(root, 'build', name),
    join(root, name)
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

export function isWhisperEngineReady(): boolean {
  return whisperExecutablePath() !== null
}

function run(command: string, args: string[], cwd: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000)
    })
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    child.on('error', (error) => {
      signal?.removeEventListener('abort', abort)
      reject(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error(
              `${command} is not installed. Install CMake and a C++ compiler (Xcode Command Line Tools on macOS) to set up local Whisper.`
            )
          : error
      )
    })
    child.on('exit', (code) => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) reject(new Error('Whisper engine setup cancelled'))
      else if (code === 0) resolve()
      else reject(new Error(`Whisper engine build failed: ${stderr.trim().split('\n').pop() ?? code}`))
    })
  })
}

let building: Promise<void> | null = null

/** Builds whisper-cli once; concurrent callers share the same build. */
export function ensureWhisperEngine(signal?: AbortSignal): Promise<void> {
  if (isWhisperEngineReady()) return Promise.resolve()
  building ??= (async () => {
    const root = whisperCppRoot()
    await run(
      'cmake',
      ['-B', 'build', '-DCMAKE_BUILD_TYPE=Release', '-DWHISPER_BUILD_TESTS=OFF'],
      root,
      signal
    )
    await run('cmake', ['--build', 'build', '--config', 'Release', '--target', 'whisper-cli', '-j', '4'], root, signal)
    if (!isWhisperEngineReady()) throw new Error('Whisper engine build finished but whisper-cli was not found.')
  })().finally(() => {
    building = null
  })
  return building
}
