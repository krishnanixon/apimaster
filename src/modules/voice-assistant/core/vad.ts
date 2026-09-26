export function rmsIsSpeech(rms: number, threshold = 0.022): boolean {
  return rms >= threshold
}

export type NoiseGateSample = { isSpeech: boolean; threshold: number; level: number }

type NoiseGateOptions = {
  /** How far above the learned floor a sample must rise. */
  multiplier?: number
  /** Absolute minimum level treated as speech (filters very quiet rooms). */
  minThreshold?: number
  /** Ceiling for the adaptive floor. */
  maxFloor?: number
  /** Require this many consecutive speech samples before opening. */
  attackSamples?: number
  /** Keep the gate open briefly after speech drops (avoids chopping words). */
  hangoverSamples?: number
}

/**
 * Learns the room noise floor and opens for clear speech above it.
 * Quiet ambient noise stays closed; normal talking toward the mic opens.
 */
export function createNoiseGate(options: NoiseGateOptions = {}) {
  const multiplier = options.multiplier ?? 3.6
  const minThreshold = options.minThreshold ?? 0.022
  const maxFloor = options.maxFloor ?? 0.03
  const attackSamples = options.attackSamples ?? 2
  const hangoverSamples = options.hangoverSamples ?? 5
  let floor = 0.01
  let attack = 0
  let hangover = 0
  let calibrated = 0

  return {
    sample(rms: number): NoiseGateSample {
      const level = Number.isFinite(rms) ? Math.max(0, rms) : 0

      // First ~300ms: learn the room before deciding anything is speech.
      if (calibrated < 8) {
        calibrated += 1
        floor = Math.min(maxFloor, Math.max(0.003, floor * 0.7 + level * 0.3))
        return { isSpeech: false, threshold: Math.max(minThreshold, floor * multiplier), level }
      }

      const threshold = Math.max(minThreshold, floor * multiplier)
      const candidate = level >= threshold

      if (candidate) {
        attack += 1
        floor = Math.min(maxFloor, floor * 0.997 + Math.min(level, threshold) * 0.003)
      } else {
        attack = 0
        floor = Math.min(maxFloor, Math.max(0.003, floor * 0.93 + level * 0.07))
      }

      if (attack >= attackSamples) hangover = hangoverSamples
      else if (hangover > 0) hangover -= 1

      return {
        isSpeech: attack >= attackSamples || hangover > 0,
        threshold,
        level
      }
    },
    get threshold() {
      return Math.max(minThreshold, floor * multiplier)
    }
  }
}

export type TurnDetectorSample = 'continue' | 'end'

/** Ends a listen turn only after real speech, then a pause. Initial silence is ignored. */
export function createTurnDetector(options: { silenceMs: number; minSpeechMs?: number; maxMs?: number }) {
  const minSpeechMs = options.minSpeechMs ?? 280
  const maxMs = options.maxMs ?? 20000
  let heard = false
  let speechMs = 0
  let silentMs = 0
  let elapsedMs = 0

  return {
    /** Marks speech from captions / STT (used with a soft energy check in the store). */
    markSpeech(dt = 100): void {
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 250) : 100
      heard = true
      speechMs += step
      silentMs = 0
    },
    sample(isSpeech: boolean, dt = 100): TurnDetectorSample {
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 250) : 100
      elapsedMs += step
      if (isSpeech) {
        heard = true
        speechMs += step
        silentMs = 0
        return 'continue'
      }
      if (!heard) return 'continue'
      silentMs += step
      if (speechMs >= minSpeechMs && silentMs >= options.silenceMs) return 'end'
      if (elapsedMs >= maxMs) return 'end'
      return 'continue'
    },
    get heardSpeech() {
      return heard
    }
  }
}
