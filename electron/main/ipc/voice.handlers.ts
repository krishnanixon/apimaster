import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { IpcResult } from '@shared/types'
import type {
  VoiceAssistantSettingsPatch,
  VoiceAudioPayload,
  VoiceTranscript,
  VoiceLocalModelId
} from '@shared/types/voice-assistant'
import { logger } from '../infra/logger.service'
import { bindVoiceEngineToWindow, voiceEngine } from '../voice-assistant/VoiceEngine'
import { voiceConversationStore } from '../voice-assistant/conversation.store'
import { voiceSettingsStore } from '../voice-assistant/settings.store'
import { voiceMemoryRepository } from '../voice-assistant/voice-db'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { voiceModelManager } from '../voice-assistant/model-manager'

const isVoiceModelId = (value: unknown): value is VoiceLocalModelId =>
  value === 'whisper-base.en' || value === 'whisper-small' || value === 'kokoro-82m'

function success<T>(data?: T): IpcResult<T> {
  return { success: true, data }
}

function failure<T>(error: string): IpcResult<T> {
  logger.error(error, 'VoiceIPC')
  return { success: false, error }
}

export function registerVoiceHandlers(getMainWindow: () => BrowserWindow | null): void {
  bindVoiceEngineToWindow(getMainWindow)

  ipcMain.handle(IPC_CHANNELS.VOICE_STATUS, () => {
    try {
      return success(voiceEngine.status())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read voice status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_GET_SETTINGS, () => {
    try {
      return success(voiceSettingsStore.get())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read voice settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_UPDATE_SETTINGS, (_e, patch: VoiceAssistantSettingsPatch) => {
    try {
      return success(voiceSettingsStore.update(patch ?? {}))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to update voice settings')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_MODEL_STATUS, async () => {
    try {
      return success(await voiceModelManager.status())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to read local model status')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_MODEL_DOWNLOAD, async (_e, id: unknown) => {
    if (!isVoiceModelId(id)) return failure('Unknown voice model')
    try {
      await voiceModelManager.download(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to download local model')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_MODEL_CANCEL_DOWNLOAD, (_e, id: unknown) => {
    if (!isVoiceModelId(id)) return failure('Unknown voice model')
    voiceModelManager.cancelDownload(id)
    return success()
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_MODEL_REMOVE, async (_e, id: unknown) => {
    if (!isVoiceModelId(id)) return failure('Unknown voice model')
    try {
      await voiceModelManager.remove(id)
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to remove local model')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_LIST_CONVERSATIONS, () => {
    try {
      const settings = voiceSettingsStore.get()
      if (!settings.privacy.storeConversations) return success([])
      return success(voiceConversationStore.list())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to list conversations')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_SEARCH_CONVERSATIONS, (_e, query: string) => {
    try {
      return success(voiceConversationStore.search(String(query ?? '')))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to search conversations')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_GET_CONVERSATION, (_e, id: string) => {
    try {
      const conversation = voiceConversationStore.get(String(id ?? ''))
      if (!conversation) return failure('Conversation not found')
      return success(conversation)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to load conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_CREATE_CONVERSATION, (_e, title?: string) => {
    try {
      return success(voiceConversationStore.create(title))
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to create conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_RENAME_CONVERSATION, (_e, id: string, title: string) => {
    try {
      const updated = voiceConversationStore.rename(String(id ?? ''), String(title ?? ''))
      if (!updated) return failure('Conversation not found')
      return success(updated)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to rename conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_DELETE_CONVERSATION, (_e, id: string) => {
    try {
      const ok = voiceConversationStore.delete(String(id ?? ''))
      if (!ok) return failure('Conversation not found')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to delete conversation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_START_LISTENING, () => {
    try {
      voiceEngine.setListening()
      return success(voiceEngine.status())
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to start listening')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_TRANSCRIBE, async (_e, audio: VoiceAudioPayload) => {
    try {
      if (!audio?.dataBase64) return failure('Audio is required')
      const transcript = await voiceEngine.transcribe(audio)
      return success(transcript)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Transcription failed')
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.VOICE_PROCESS_TURN,
    async (_e, conversationId: string | null, transcript: VoiceTranscript) => {
      try {
        if (!transcript?.text?.trim()) return failure('Transcript is empty')
        const result = await voiceEngine.processTranscript(conversationId, transcript)
        return success(result)
      } catch (e) {
        return failure(e instanceof Error ? e.message : 'Voice turn failed')
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.VOICE_SYNTHESIZE, async (_e, text: string) => {
    try {
      const spoken = await voiceEngine.synthesize(String(text ?? ''))
      return success(spoken)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Speech synthesis failed')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_STOP_SPEECH, () => {
    try {
      voiceEngine.stopSpeech()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to stop speech')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_FINISH_SPEAKING, () => {
    try {
      voiceEngine.finishSpeaking()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to finish speaking')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_CANCEL, () => {
    try {
      voiceEngine.cancel()
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to cancel')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_CONFIRM_TOOL, (_e, requestId: string, approved: boolean) => {
    try {
      const ok = voiceEngine.resolveConfirmation(String(requestId ?? ''), Boolean(approved))
      if (!ok) return failure('No pending confirmation')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to resolve confirmation')
    }
  })

  ipcMain.handle(IPC_CHANNELS.VOICE_CLEAR_DATA, () => {
    try {
      voiceConversationStore.clearAll()
      void voiceMemoryRepository.clearAll()
      const notes = join(app.getPath('userData'), 'voice-assistant')
      if (existsSync(notes)) rmSync(notes, { recursive: true, force: true })
      logger.info('Voice local data cleared', 'Voice')
      return success()
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Failed to clear voice data')
    }
  })
}
