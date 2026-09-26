/**
 * Lightweight energy-based VAD helper. Used for architecture and tests.
 * Live microphone VAD runs in the renderer from PCM samples.
 */
export class VoiceActivityDetector {
  constructor(
    private readonly options: { silenceTimeoutMs: number; energyThreshold: number } = {
      silenceTimeoutMs: 1500,
      energyThreshold: 0.018
    }
  ) {}

  isSpeech(rms: number): boolean {
    return rms >= this.options.energyThreshold
  }

  shouldStop(silentMs: number): boolean {
    return silentMs >= this.options.silenceTimeoutMs
  }
}
