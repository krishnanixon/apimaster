import { spawn, type ChildProcess } from 'child_process'

let child: ChildProcess | null = null

export function stopNativeSpeech(): void {
  if (!child) return
  const running = child
  child = null
  try {
    running.kill()
  } catch {
    // already exited
  }
}

export async function speakNative(
  text: string,
  options: { voice?: string; speed?: number; volume?: number }
): Promise<boolean> {
  const spoken = text.replace(/\s+/g, ' ').trim().slice(0, 4000)
  if (!spoken) return false
  stopNativeSpeech()

  const speed = options.speed && options.speed > 0 ? options.speed : 1
  const volume = typeof options.volume === 'number' ? Math.min(1, Math.max(0, options.volume)) : 1

  if (process.platform === 'win32') {
    return run(windowsArgs(spoken, options.voice, speed, volume))
  }
  if (process.platform === 'darwin') {
    const args = ['-r', String(Math.round(175 * speed))]
    if (options.voice) args.push('-v', options.voice)
    args.push(spoken)
    return run({ command: 'say', args })
  }

  const rate = String(Math.round(175 * speed))
  const linuxAttempts = [
    { command: 'spd-say', args: ['-r', String(Math.round((speed - 1) * 100)), spoken] },
    { command: 'espeak', args: ['-s', rate, spoken] }
  ]
  for (const attempt of linuxAttempts) {
    if (await run(attempt)) return true
  }
  return false
}

function windowsArgs(
  text: string,
  voice: string | undefined,
  speed: number,
  volume: number
): { command: string; args: string[] } {
  const rate = Math.max(-10, Math.min(10, Math.round((speed - 1) * 10)))
  const level = Math.round(volume * 100)
  const payload = Buffer.from(text, 'utf8').toString('base64')
  const voiceLine = voice
    ? `try { $speak.SelectVoice([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(voice, 'utf8').toString('base64')}'))) } catch {}`
    : ''
  const script = `
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = ${rate}
$speak.Volume = ${level}
${voiceLine}
$speak.Speak([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))
`.trim()
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encodeUtf16(script)]
  }
}

function encodeUtf16(value: string): string {
  return Buffer.from(value, 'utf16le').toString('base64')
}

function run(spec: { command: string; args: string[] }): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const spawned = spawn(spec.command, spec.args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore']
      })
      child = spawned
      spawned.on('error', () => {
        if (child === spawned) child = null
        resolve(false)
      })
      spawned.on('exit', (code) => {
        if (child === spawned) child = null
        resolve(code === 0)
      })
    } catch {
      resolve(false)
    }
  })
}
