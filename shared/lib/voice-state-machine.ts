import type { VoiceState } from '../types/voice-assistant'

const ALLOWED: Record<VoiceState, readonly VoiceState[]> = {
  IDLE: ['LISTENING', 'ERROR'],
  LISTENING: ['PROCESSING', 'IDLE', 'ERROR'],
  PROCESSING: ['THINKING', 'IDLE', 'ERROR'],
  THINKING: ['THINKING', 'SPEAKING', 'IDLE', 'ERROR'],
  SPEAKING: ['IDLE', 'LISTENING', 'ERROR'],
  ERROR: ['IDLE']
}

export class VoiceStateMachine {
  private current: VoiceState = 'IDLE'

  get state(): VoiceState {
    return this.current
  }

  canTransition(next: VoiceState): boolean {
    return ALLOWED[this.current].includes(next)
  }

  transition(next: VoiceState): VoiceState {
    if (!this.canTransition(next)) {
      throw new Error(`Invalid voice state transition: ${this.current} → ${next}`)
    }
    this.current = next
    return this.current
  }

  /** Errors always recover through ERROR then IDLE. */
  fail(): VoiceState {
    if (this.current !== 'ERROR') {
      if (this.canTransition('ERROR')) this.current = 'ERROR'
      else this.current = 'ERROR'
    }
    return this.current
  }

  reset(): VoiceState {
    this.current = 'IDLE'
    return this.current
  }

  /** Barge-in: stop speaking and start capturing the user. */
  interruptToListen(): VoiceState {
    if (this.current === 'SPEAKING' || this.current === 'IDLE') {
      this.current = 'LISTENING'
      return this.current
    }
    throw new Error(`Cannot barge-in from ${this.current}`)
  }
}

export function isActiveVoiceState(state: VoiceState): boolean {
  return state !== 'IDLE' && state !== 'ERROR'
}
