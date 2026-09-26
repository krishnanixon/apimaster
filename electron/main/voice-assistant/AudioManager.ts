const MAX_AUDIO_BYTES = 4 * 1024 * 1024

export class AudioManager {
  decodeBase64(dataBase64: string): Buffer {
    const buffer = Buffer.from(dataBase64, 'base64')
    if (buffer.byteLength === 0) throw new Error('Empty audio buffer')
    if (buffer.byteLength > MAX_AUDIO_BYTES) throw new Error('Audio buffer is too large')
    return buffer
  }

  byteLength(dataBase64: string): number {
    return Buffer.from(dataBase64, 'base64').byteLength
  }
}

export const audioManager = new AudioManager()
