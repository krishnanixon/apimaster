import { IPC_CHANNELS } from '@shared/ipc/channels'
import { BrowserWindow } from 'electron'
import { VoiceStateMachine } from '@shared/lib/voice-state-machine'
import { classifyProviderError, classifySttError, voiceUserError } from '@shared/lib/voice-errors'
import type {
  VoiceAudioPayload,
  VoiceEngineEvent,
  VoiceProcessingMode,
  VoiceRuntimeStatus,
  VoiceState,
  VoiceSynthesizeResult,
  VoiceTranscript,
  VoiceTurnResult
} from '@shared/types/voice-assistant'
import { logger } from '../infra/logger.service'
import { contextManager } from './ai/ContextManager'
import { aiOrchestrator } from './ai/AIOrchestrator'
import { isCloudVoicePipeline, routeVoiceModel } from './ai/ModelRouter'
import { aiConfigService } from '../ai/config/ai-config.service'
import { audioManager } from './AudioManager'
import { voiceConversationStore } from './conversation.store'
import { voiceSettingsStore } from './settings.store'
import { getSTTProvider } from './stt/stt-registry'
import { getTTSProvider, stopAllTTS } from './tts/tts-registry'
import { registerBuiltinTools } from './tools/register-builtin'
import { toolExecutor } from './tools/ToolExecutor'
import { VoiceActivityDetector } from './VoiceActivityDetector'
import {
  detectClipboardIntent,
  preparePasteTarget,
  readClipboardText,
  runClipboardTransformTurn
} from './clipboardAssist'
import {
  detectNoteIntent,
  detectNoteLookupIntent,
  runLookupNotesTurn,
  runSaveNoteTurn
} from './noteAssist'
import { buildVoiceWorldContext } from './world-context'
import { detectRememberIntent } from '@shared/lib/voice-memory-intent'
import { voiceMemoryRepository } from './voice-db'

type EventSink = (event: VoiceEngineEvent) => void

function workbenchMode() {
  return aiConfigService.get().mode
}

class VoiceEngine {
  private machine = new VoiceStateMachine()
  private abort: AbortController | null = null
  private activeConversationId: string | null = null
  private sink: EventSink | null = null
  readonly vad = new VoiceActivityDetector()

  constructor() {
    registerBuiltinTools()
  }

  setEventSink(sink: EventSink | null): void {
    this.sink = sink
  }

  status(): VoiceRuntimeStatus {
    const settings = voiceSettingsStore.get()
    return {
      state: this.machine.state,
      processingMode: routeVoiceModel(settings, workbenchMode()).processingMode,
      error: null,
      activeConversationId: this.activeConversationId,
      cloudProcessing: isCloudVoicePipeline(settings, workbenchMode())
    }
  }

  processingMode(): VoiceProcessingMode {
    return routeVoiceModel(voiceSettingsStore.get(), workbenchMode()).processingMode
  }

  setListening(): VoiceState {
    stopAllTTS()
    void preparePasteTarget()
    if (this.machine.state === 'SPEAKING') {
      return this.machine.interruptToListen()
    }
    if (this.machine.state === 'IDLE' || this.machine.state === 'ERROR') {
      this.machine.reset()
    }
    const next =
      this.machine.state === 'IDLE' ? this.machine.transition('LISTENING') : this.machine.state
    this.emit({ type: 'state', state: next })
    logger.info('Voice recording started', 'Voice')
    return next
  }

  cancel(): void {
    this.abort?.abort()
    this.abort = null
    toolExecutor.cancelAll()
    stopAllTTS()
    this.machine.reset()
    this.emit({ type: 'state', state: 'IDLE' })
    logger.info('Voice request cancelled', 'Voice')
  }

  stopSpeech(): void {
    stopAllTTS()
    if (this.machine.state === 'SPEAKING') {
      this.machine.reset()
      this.emit({ type: 'state', state: 'IDLE' })
    }
  }

  async transcribe(audio: VoiceAudioPayload): Promise<VoiceTranscript> {
    const settings = voiceSettingsStore.get()
    const requested = settings.stt.provider
    const provider = getSTTProvider(requested === 'browser' ? 'local-whisper' : requested)
    if (!provider) {
      throw new Error(
        'No local speech-to-text provider is available. Download a Whisper model in Voice settings.'
      )
    }
    audioManager.decodeBase64(audio.dataBase64)
    this.abort?.abort()
    const operation = new AbortController()
    this.abort = operation
    this.beginProcessing()
    try {
      const language = settings.stt.autoDetectLanguage ? undefined : settings.stt.language
      const transcript = await provider.transcribe(audio, {
        language,
        signal: operation.signal
      })
      operation.signal.throwIfAborted()
      logger.info('STT request completed', 'Voice')
      return transcript
    } catch (error) {
      if (!operation.signal.aborted) this.fail(classifySttError(error))
      throw error
    }
  }

  async processTranscript(
    conversationId: string | null,
    transcript: VoiceTranscript
  ): Promise<VoiceTurnResult> {
    const settings = voiceSettingsStore.get()
    const text = transcript.text.trim()
    if (!text) {
      const error = voiceUserError('stt-empty')
      this.fail(error)
      throw new Error(error.message)
    }

    this.abort?.abort()
    const operation = new AbortController()
    this.abort = operation
    this.beginProcessing()
    const conversation = conversationId
      ? (voiceConversationStore.get(conversationId) ?? voiceConversationStore.create())
      : voiceConversationStore.create()
    this.activeConversationId = conversation.id

    const userMessage = voiceConversationStore.addMessage(conversation.id, 'user', text)
    if (!userMessage) throw new Error('Failed to store user message')

    this.safeTransition('THINKING')
    this.emit({
      type: 'state',
      state: 'THINKING',
      cloudProcessing: isCloudVoicePipeline(settings, workbenchMode())
    })

    try {
      const clipboardIntent = detectClipboardIntent(text)
      if (clipboardIntent?.kind === 'transform') {
        const { spoken, resultText } = await runClipboardTransformTurn(
          clipboardIntent.action,
          operation.signal
        )
        operation.signal.throwIfAborted()
        const assistantMessage = voiceConversationStore.addMessage(
          conversation.id,
          'assistant',
          spoken,
          {
            metadata: resultText ? { clipboardResult: resultText.slice(0, 4000) } : undefined
          }
        )
        if (!assistantMessage) throw new Error('Failed to store assistant message')
        this.safeTransition('SPEAKING')
        this.emit({ type: 'state', state: 'SPEAKING' })
        const result: VoiceTurnResult = {
          conversationId: conversation.id,
          userMessage,
          assistantMessage,
          transcript,
          processingMode: routeVoiceModel(settings, workbenchMode()).processingMode
        }
        this.emit({ type: 'turn-complete', result, state: 'SPEAKING' })
        return result
      }

      const noteIntent = detectNoteIntent(text)
      if (noteIntent) {
        const { spoken } = await runSaveNoteTurn(noteIntent)
        operation.signal.throwIfAborted()
        const assistantMessage = voiceConversationStore.addMessage(
          conversation.id,
          'assistant',
          spoken
        )
        if (!assistantMessage) throw new Error('Failed to store assistant message')
        this.safeTransition('SPEAKING')
        this.emit({ type: 'state', state: 'SPEAKING' })
        const result: VoiceTurnResult = {
          conversationId: conversation.id,
          userMessage,
          assistantMessage,
          transcript,
          processingMode: routeVoiceModel(settings, workbenchMode()).processingMode
        }
        this.emit({ type: 'turn-complete', result, state: 'SPEAKING' })
        return result
      }

      const noteLookup = detectNoteLookupIntent(text)
      if (noteLookup) {
        const { spoken } = await runLookupNotesTurn(noteLookup)
        operation.signal.throwIfAborted()
        const assistantMessage = voiceConversationStore.addMessage(
          conversation.id,
          'assistant',
          spoken
        )
        if (!assistantMessage) throw new Error('Failed to store assistant message')
        this.safeTransition('SPEAKING')
        this.emit({ type: 'state', state: 'SPEAKING' })
        const result: VoiceTurnResult = {
          conversationId: conversation.id,
          userMessage,
          assistantMessage,
          transcript,
          processingMode: routeVoiceModel(settings, workbenchMode()).processingMode
        }
        this.emit({ type: 'turn-complete', result, state: 'SPEAKING' })
        return result
      }

      if (settings.memory?.enabled !== false) {
        const remember = detectRememberIntent(text)
        if (remember) {
          await voiceMemoryRepository.remember({ content: remember.fact, source: 'spoken' })
          operation.signal.throwIfAborted()
          const spoken = `I'll remember that. ${remember.fact}`
          const assistantMessage = voiceConversationStore.addMessage(
            conversation.id,
            'assistant',
            spoken
          )
          if (!assistantMessage) throw new Error('Failed to store assistant message')
          this.safeTransition('SPEAKING')
          this.emit({ type: 'state', state: 'SPEAKING' })
          const result: VoiceTurnResult = {
            conversationId: conversation.id,
            userMessage,
            assistantMessage,
            transcript,
            processingMode: routeVoiceModel(settings, workbenchMode()).processingMode
          }
          this.emit({ type: 'turn-complete', result, state: 'SPEAKING' })
          return result
        }
      }

      if (clipboardIntent?.kind === 'ask_about') {
        const clip = readClipboardText()
        if (clip) {
          voiceConversationStore.addMessage(conversation.id, 'tool', `Last copied text:\n${clip}`, {
            metadata: { toolName: 'get_clipboard' }
          })
        } else {
          voiceConversationStore.addMessage(conversation.id, 'tool', 'Clipboard is empty.', {
            metadata: { toolName: 'get_clipboard' }
          })
        }
      }

      let pendingConfirmation = undefined
      const extraBlocks = await buildVoiceWorldContext(text, settings)
      operation.signal.throwIfAborted()
      const MAX_TOOL_HOPS = 4
      for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
        const latest = voiceConversationStore.get(conversation.id)
        if (!latest) throw new Error('Conversation missing')
        const context = contextManager.build(latest.messages, settings, extraBlocks)
        const response = await aiOrchestrator.chat({
          messages: context,
          settings,
          signal: operation.signal
        })

        operation.signal.throwIfAborted()
        if (response.toolCalls.length > 0) {
          const call = response.toolCalls[0]
          const outcome = await toolExecutor.execute(conversation.id, call.name, call.arguments)
          operation.signal.throwIfAborted()
          if (outcome.pending) {
            pendingConfirmation = outcome.pending
            this.emit({
              type: 'tool-confirmation',
              confirmation: outcome.pending,
              state: 'THINKING'
            })
            const approved = await toolExecutor.waitForConfirmation(outcome.pending)
            operation.signal.throwIfAborted()
            if (!approved) {
              voiceConversationStore.addMessage(
                conversation.id,
                'tool',
                'The user declined this action.',
                {
                  metadata: { toolName: call.name }
                }
              )
              continue
            }
            const confirmed = await toolExecutor.execute(
              conversation.id,
              call.name,
              call.arguments,
              {
                confirmed: true
              }
            )
            operation.signal.throwIfAborted()
            voiceConversationStore.addMessage(
              conversation.id,
              'tool',
              confirmed.result?.output ?? 'Tool finished.',
              { metadata: { toolName: call.name } }
            )
            continue
          }
          voiceConversationStore.addMessage(
            conversation.id,
            'tool',
            outcome.result?.output ?? 'Tool finished.',
            {
              metadata: { toolName: call.name },
              toolResults: outcome.result ? [outcome.result] : undefined
            }
          )
          continue
        }

        const spoken = response.text.trim() || 'I am not sure how to help with that.'
        this.emit({ type: 'response-chunk', chunk: spoken, state: 'THINKING' })
        operation.signal.throwIfAborted()
        const assistantMessage = voiceConversationStore.addMessage(
          conversation.id,
          'assistant',
          spoken
        )
        if (!assistantMessage) throw new Error('Failed to store assistant message')
        logger.info('AI request completed', 'Voice')

        this.safeTransition('SPEAKING')
        this.emit({ type: 'state', state: 'SPEAKING' })

        const result: VoiceTurnResult = {
          conversationId: conversation.id,
          userMessage,
          assistantMessage,
          transcript,
          processingMode: routeVoiceModel(settings, workbenchMode()).processingMode,
          pendingConfirmation
        }
        this.emit({ type: 'turn-complete', result, state: 'SPEAKING' })
        return result
      }

      throw new Error('Too many tool steps')
    } catch (error) {
      if (operation.signal.aborted) throw error
      this.fail(classifyProviderError(error))
      throw error
    }
  }

  async synthesize(text: string): Promise<VoiceSynthesizeResult> {
    const settings = voiceSettingsStore.get()
    const provider = getTTSProvider(settings.tts.provider)
    try {
      const spoken = await provider.speak(text, {
        voice: settings.tts.voice,
        speed: settings.tts.speed,
        volume: settings.tts.volume,
        signal: this.abort?.signal
      })
      return spoken
    } catch (error) {
      logger.warn('TTS provider unavailable', 'Voice')
      throw error
    }
  }

  finishSpeaking(): void {
    if (this.machine.state === 'SPEAKING' || this.machine.state === 'ERROR') {
      this.machine.reset()
      this.emit({ type: 'state', state: 'IDLE' })
    }
  }

  resolveConfirmation(requestId: string, approved: boolean): boolean {
    return toolExecutor.resolveConfirmation(requestId, approved)
  }

  private beginProcessing(): void {
    if (this.machine.state === 'ERROR') this.machine.reset()
    if (this.machine.state === 'IDLE') this.machine.transition('LISTENING')
    if (this.machine.state === 'LISTENING') this.machine.transition('PROCESSING')
    this.emit({ type: 'state', state: this.machine.state })
  }

  private safeTransition(next: VoiceState): void {
    if (this.machine.state === next) return
    if (this.machine.canTransition(next)) {
      this.machine.transition(next)
      return
    }
    this.machine.reset()
    if (this.machine.canTransition(next)) this.machine.transition(next)
  }

  private fail(error: ReturnType<typeof voiceUserError>): void {
    this.machine.fail()
    this.emit({ type: 'error', error, state: 'ERROR' })
    this.machine.reset()
    this.emit({ type: 'state', state: 'IDLE' })
  }

  private emit(event: VoiceEngineEvent): void {
    this.sink?.(event)
  }
}

export const voiceEngine = new VoiceEngine()

export function bindVoiceEngineToWindow(getWindow: () => BrowserWindow | null): void {
  voiceEngine.setEventSink((event) => {
    getWindow()?.webContents.send(IPC_CHANNELS.VOICE_EVENT, event)
  })
}
