import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@/features/chat/stores/chat.store'
import { Dictation } from '@/modules/voice-assistant/core/dictation'
import {
  speakAloud,
  stopSpeaking,
  useVoiceAssistantStore,
  voiceInputSetupError
} from '@/modules/voice-assistant/stores/voice.store'

/** Where a hands-free voice conversation is in its listen → answer → speak loop. */
export type ChatVoicePhase = 'off' | 'listening' | 'transcribing' | 'waiting' | 'speaking'

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return 'Microphone access was denied. Allow it in system settings and try again.'
    }
    return message || 'Voice input failed'
  }
  return 'Voice input failed'
}

/** Resolves with the final reply once the chat stream that is running now completes. */
function waitForReply(): Promise<string> {
  return new Promise((resolve) => {
    let latest = useChatStore.getState().streamingContent
    const finish = () => {
      const last = [...useChatStore.getState().messages].reverse().find((m) => m.role === 'assistant')
      resolve(latest || last?.content || '')
    }
    if (!useChatStore.getState().isStreaming) return finish()
    const unsub = useChatStore.subscribe((state) => {
      if (state.streamingContent) latest = state.streamingContent
      if (!state.isStreaming) {
        unsub()
        finish()
      }
    })
  })
}

/**
 * Voice for the chat screen: dictate into the composer, hold a spoken back-and-forth,
 * and read replies aloud. Uses the same speech engine and settings as Tess, and hands
 * the microphone back and forth with her so only one listener is ever open.
 */
export function useChatVoice(send: (text: string) => Promise<void>) {
  const dictation = useRef(new Dictation())
  const run = useRef(0)
  const sendRef = useRef(send)
  sendRef.current = send
  /** True while chat started the current playback — never cut off Tess's own speech. */
  const ownsSpeech = useRef(false)

  const [dictating, setDictating] = useState<'off' | 'recording' | 'transcribing'>('off')
  const [phase, setPhase] = useState<ChatVoicePhase>('off')
  const [level, setLevel] = useState(0)
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  const releaseTess = useCallback(async () => {
    const tess = useVoiceAssistantStore.getState()
    if (tess.sessionActive) await tess.endSession()
  }, [])

  const ensureReady = useCallback(async (): Promise<boolean> => {
    const setup = await voiceInputSetupError()
    if (setup) {
      toast.error(setup.message)
      return false
    }
    await releaseTess()
    return true
  }, [releaseTess])

  const stopOwnSpeech = useCallback(() => {
    if (!ownsSpeech.current) return
    ownsSpeech.current = false
    stopSpeaking()
  }, [])

  const speak = useCallback(async (text: string) => {
    ownsSpeech.current = true
    try {
      await speakAloud(text)
    } finally {
      ownsSpeech.current = false
    }
  }, [])

  const stopConversation = useCallback(() => {
    run.current += 1
    dictation.current.cancel()
    stopOwnSpeech()
    setPhase('off')
    setLevel(0)
  }, [stopOwnSpeech])

  const stopReading = useCallback(() => {
    stopOwnSpeech()
    setSpeakingId(null)
  }, [stopOwnSpeech])

  const cancelAll = useCallback(() => {
    stopConversation()
    stopReading()
    setDictating('off')
  }, [stopConversation, stopReading])

  // One conversation turn: listen until a pause, send, wait for the answer, speak it, repeat.
  const listenTurn = useCallback(
    async (id: number) => {
      if (id !== run.current) return
      setPhase('listening')
      const settings = useVoiceAssistantStore.getState().settings
      const finish = async () => {
        if (id !== run.current) return
        setPhase('transcribing')
        setLevel(0)
        try {
          const text = await dictation.current.stop()
          if (id !== run.current) return
          if (!text) return void listenTurn(id)
          setPhase('waiting')
          await sendRef.current(text)
          const reply = await waitForReply()
          if (id !== run.current) return
          if (reply) {
            setPhase('speaking')
            await speak(reply)
          }
          if (id === run.current) void listenTurn(id)
        } catch (error) {
          if (id !== run.current) return
          toast.error(errorMessage(error))
          stopConversation()
        }
      }
      try {
        await dictation.current.start(settings, {
          autoStop: true,
          onLevel: setLevel,
          onSilence: () => void finish()
        })
      } catch (error) {
        if (id !== run.current) return
        toast.error(errorMessage(error))
        stopConversation()
      }
    },
    [stopConversation, speak]
  )

  const startConversation = useCallback(async () => {
    cancelAll()
    const id = run.current
    if (!(await ensureReady()) || id !== run.current) return
    void listenTurn(id)
  }, [cancelAll, ensureReady, listenTurn])

  /** Click to start recording, click again to insert the transcript via `onText`. */
  const toggleDictation = useCallback(
    async (onText: (text: string) => void) => {
      if (dictating === 'recording') {
        setDictating('transcribing')
        setLevel(0)
        try {
          const text = await dictation.current.stop()
          if (text) onText(text)
          else toast.message('Didn’t catch that — try again a little closer to the mic.')
        } catch (error) {
          toast.error(errorMessage(error))
        } finally {
          setDictating('off')
        }
        return
      }
      if (dictating !== 'off') return
      cancelAll()
      if (!(await ensureReady())) return
      try {
        setDictating('recording')
        await dictation.current.start(useVoiceAssistantStore.getState().settings, { onLevel: setLevel })
      } catch (error) {
        setDictating('off')
        toast.error(errorMessage(error))
      }
    },
    [dictating, cancelAll, ensureReady]
  )

  const readAloud = useCallback(
    async (messageId: string, text: string) => {
      if (speakingId === messageId) return stopReading()
      stopConversation()
      setSpeakingId(messageId)
      try {
        await speak(text)
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setSpeakingId((current) => (current === messageId ? null : current))
      }
    },
    [speakingId, stopReading, stopConversation, speak]
  )

  // Tess switched on elsewhere takes the mic — step aside.
  useEffect(
    () =>
      useVoiceAssistantStore.subscribe((next, prev) => {
        if (next.sessionActive && !prev.sessionActive) cancelAll()
      }),
    [cancelAll]
  )

  useEffect(() => () => cancelAll(), [cancelAll])

  return {
    dictating,
    phase,
    level,
    speakingId,
    toggleDictation,
    startConversation,
    stopConversation,
    readAloud,
    stopReading
  }
}
