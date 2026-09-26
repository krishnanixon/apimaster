import { describe, expect, it } from 'vitest'
import { VoiceStateMachine } from '@shared/lib/voice-state-machine'
import { buildVoiceContext } from '@shared/lib/voice-context'
import { confirmationMessage, decideToolPermission } from '@shared/lib/voice-tool-permissions'
import { assertSafePath, isInsideRoot, sanitizeFileName, UnsafePathError } from '@shared/lib/voice-path-safety'
import { parseVoiceModelOutput } from '@shared/lib/voice-model-output'
import { classifyProviderError, voiceUserError } from '@shared/lib/voice-errors'
import { DEFAULT_VOICE_ASSISTANT_SETTINGS, type VoiceMessage } from '@shared/types/voice-assistant'
import { routeVoiceModel } from '../electron/main/voice-assistant/ai/ModelRouter'
import { validateToolInput } from '../electron/main/voice-assistant/tools/types'
import { ToolRegistry } from '../electron/main/voice-assistant/tools/ToolRegistry'
import { getModuleById } from '@/shared/lib/module-registry'
import { resolveRouteModule } from '@/shared/lib/resolve-route-module'
import { isStandaloneModuleRoute } from '@/shared/lib/app-chrome'
import { APP_CATALOG } from '@/shared/lib/app-catalog'
import { join } from 'path'
import { runVoicePipeline } from '@shared/lib/voice-pipeline'
import { createNoiseGate, createTurnDetector } from '@/modules/voice-assistant/core/vad'

describe('voice state machine', () => {
  it('follows the happy-path transitions', () => {
    const machine = new VoiceStateMachine()
    expect(machine.state).toBe('IDLE')
    machine.transition('LISTENING')
    machine.transition('PROCESSING')
    machine.transition('THINKING')
    machine.transition('SPEAKING')
    machine.transition('IDLE')
    expect(machine.state).toBe('IDLE')
  })

  it('rejects illegal transitions and recovers from errors', () => {
    const machine = new VoiceStateMachine()
    expect(() => machine.transition('SPEAKING')).toThrow(/Invalid voice state/)
    machine.transition('LISTENING')
    machine.fail()
    expect(machine.state).toBe('ERROR')
    machine.reset()
    expect(machine.state).toBe('IDLE')
  })

  it('supports barge-in from SPEAKING', () => {
    const machine = new VoiceStateMachine()
    machine.transition('LISTENING')
    machine.transition('PROCESSING')
    machine.transition('THINKING')
    machine.transition('SPEAKING')
    expect(machine.interruptToListen()).toBe('LISTENING')
  })
})

describe('context manager', () => {
  it('trims old turns and keeps a system prompt', () => {
    const messages: VoiceMessage[] = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      conversationId: 'c1',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${i} ${'x'.repeat(200)}`,
      timestamp: new Date().toISOString()
    }))
    const context = buildVoiceContext({
      systemInstructions: 'You are a voice assistant.',
      messages,
      maxMessages: 6,
      maxChars: 4000
    })
    expect(context[0]?.role).toBe('system')
    expect(context.some((t) => t.content.includes('trimmed'))).toBe(true)
    expect(context.filter((t) => t.role !== 'system').length).toBeLessThanOrEqual(6)
  })
})

describe('tool permissions', () => {
  it('runs read tools automatically', () => {
    const decision = decideToolPermission({
      riskLevel: 'read',
      trustedWriteTools: [],
      toolName: 'get_current_time'
    })
    expect(decision.execute).toBe(true)
    expect(decision.requireConfirmation).toBe(false)
  })

  it('requires confirmation for write tools unless trusted', () => {
    expect(
      decideToolPermission({
        riskLevel: 'write',
        trustedWriteTools: [],
        toolName: 'create_note'
      }).requireConfirmation
    ).toBe(true)
    expect(
      decideToolPermission({
        riskLevel: 'write',
        trustedWriteTools: ['create_note'],
        toolName: 'create_note'
      }).execute
    ).toBe(true)
  })

  it('always confirms destructive tools', () => {
    const decision = decideToolPermission({
      riskLevel: 'destructive',
      trustedWriteTools: ['delete_file'],
      toolName: 'delete_file'
    })
    expect(decision.requireConfirmation).toBe(true)
    expect(confirmationMessage('delete_file', 'destructive')).toMatch(/cannot be undone/i)
  })
})

describe('tool registry and input validation', () => {
  it('registers tools once and rejects unknown properties', () => {
    const registry = new ToolRegistry()
    registry.register({
      name: 'ping',
      description: 'ping',
      riskLevel: 'read',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => ({ ok: true, output: 'pong' })
    })
    expect(registry.has('ping')).toBe(true)
    expect(() =>
      registry.register({
        name: 'ping',
        description: 'dup',
        riskLevel: 'read',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true, output: '' })
      })
    ).toThrow(/already registered/)

    const schema = {
      type: 'object' as const,
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false
    }
    expect(validateToolInput(schema, { title: 'Hello' }).ok).toBe(true)
    expect(validateToolInput(schema, { title: 'Hello', extra: true }).ok).toBe(false)
    expect(validateToolInput(schema, { title: 1 }).ok).toBe(false)
    expect(validateToolInput(schema, null).ok).toBe(false)
  })
})

describe('path safety', () => {
  const root = join(process.cwd(), 'tmp-voice-notes')

  it('allows paths inside the sandbox', () => {
    const resolved = assertSafePath('meeting.md', [root])
    expect(isInsideRoot(resolved, root)).toBe(true)
  })

  it('rejects traversal and absolute escape', () => {
    expect(() => assertSafePath('../secret.txt', [root])).toThrow(UnsafePathError)
    expect(() => assertSafePath('..\\secret.txt', [root])).toThrow(UnsafePathError)
    expect(() => assertSafePath('/etc/passwd', [root])).toThrow(UnsafePathError)
    expect(() => assertSafePath('a\0b.md', [root])).toThrow(UnsafePathError)
  })

  it('sanitizes note file names', () => {
    expect(sanitizeFileName('../evil')).toBe('-evil')
    expect(sanitizeFileName('')).toBe('note')
  })
})

describe('provider routing and model output', () => {
  it('routes local vs cloud providers', () => {
    const local = routeVoiceModel(
      { ...DEFAULT_VOICE_ASSISTANT_SETTINGS, ai: { ...DEFAULT_VOICE_ASSISTANT_SETTINGS.ai, provider: 'ollama' } },
      'openai'
    )
    expect(local.processingMode).toBe('local')
    const cloud = routeVoiceModel(
      { ...DEFAULT_VOICE_ASSISTANT_SETTINGS, ai: { ...DEFAULT_VOICE_ASSISTANT_SETTINGS.ai, provider: 'openai' } },
      'ollama'
    )
    expect(cloud.processingMode).toBe('cloud')
  })

  it('parses tool calls and spoken responses', () => {
    const tool = parseVoiceModelOutput('{"type":"tool_call","name":"get_current_time","input":{}}')
    expect(tool.toolName).toBe('get_current_time')
    const spoken = parseVoiceModelOutput('{"type":"response","text":"It is 3pm."}')
    expect(spoken.text).toBe('It is 3pm.')
    expect(parseVoiceModelOutput('Just a sentence.').text).toBe('Just a sentence.')
  })

  it('maps provider errors without exposing stacks', () => {
    const err = classifyProviderError(new Error('401 unauthorized API key'))
    expect(err.code).toBe('ai-invalid-key')
    expect(err.message).not.toMatch(/stack/i)
    expect(voiceUserError('stt-empty').message.length).toBeGreaterThan(10)
  })
})

describe('voice is part of Tess and Chat, not a module', () => {
  it('has no standalone voice module, catalog app, or route chrome', () => {
    expect(getModuleById('voice-assistant')).toBeUndefined()
    expect(resolveRouteModule('/voice-assistant')?.moduleId).not.toBe('voice-assistant')
    expect(isStandaloneModuleRoute('/voice-assistant')).toBe(false)
    expect(APP_CATALOG.some((app) => app.moduleId === 'voice-assistant')).toBe(false)
    expect(getModuleById('assistant')?.path).toBe('/assistant')
  })

  it('keeps Tess off until the user turns her on', () => {
    expect(DEFAULT_VOICE_ASSISTANT_SETTINGS.voice.autoStart).toBe(false)
    expect(DEFAULT_VOICE_ASSISTANT_SETTINGS.voice.showFloatingIcon).toBe(true)
  })
})

describe('voice pipeline integration', () => {
  const audio = { mimeType: 'audio/webm', dataBase64: 'AAAA' }

  it('runs STT → AI → TTS', async () => {
    const spoken: string[] = []
    const result = await runVoicePipeline({
      audio,
      stt: { transcribe: async () => ({ text: 'What time is it?' }) },
      ai: { chat: async () => '{"type":"response","text":"It is three o clock."}' },
      tts: {
        speak: async (text) => {
          spoken.push(text)
        },
        stop: () => undefined
      }
    })
    expect(result.transcript).toBe('What time is it?')
    expect(result.response).toBe('It is three o clock.')
    expect(spoken).toEqual(['It is three o clock.'])
  })

  it('runs AI → tool → AI → TTS', async () => {
    let hop = 0
    const result = await runVoicePipeline({
      audio,
      stt: { transcribe: async () => ({ text: 'Create a note called agenda' }) },
      ai: {
        chat: async (_transcript, toolResults) => {
          hop += 1
          if (toolResults.length === 0) {
            return '{"type":"tool_call","name":"create_note","input":{"title":"agenda"}}'
          }
          return '{"type":"response","text":"I saved the agenda note."}'
        }
      },
      tools: {
        execute: async (name, input) => {
          expect(name).toBe('create_note')
          expect(input.title).toBe('agenda')
          return 'Note saved'
        }
      },
      tts: { speak: async () => undefined, stop: () => undefined }
    })
    expect(hop).toBe(2)
    expect(result.toolOutputs).toEqual(['Note saved'])
    expect(result.response).toBe('I saved the agenda note.')
  })

  it('rejects empty transcripts and stops TTS on cancel', async () => {
    await expect(
      runVoicePipeline({
        audio,
        stt: { transcribe: async () => ({ text: '  ' }) },
        ai: { chat: async () => '' },
        tts: { speak: async () => undefined, stop: () => undefined }
      })
    ).rejects.toThrow(/Empty transcript/)

    const controller = new AbortController()
    controller.abort()
    let stopped = false
    await expect(
      runVoicePipeline({
        audio,
        stt: { transcribe: async () => ({ text: 'hello' }) },
        ai: { chat: async () => '{"type":"response","text":"Hi"}' },
        tts: {
          speak: async () => undefined,
          stop: () => {
            stopped = true
          }
        },
        signal: controller.signal
      })
    ).rejects.toThrow(/cancelled/)
    expect(stopped).toBe(false)
  })

  it('does not execute unregistered tools', async () => {
    const registry = new ToolRegistry()
    expect(registry.has('rm_rf')).toBe(false)
    await expect(
      runVoicePipeline({
        audio,
        stt: { transcribe: async () => ({ text: 'delete everything' }) },
        ai: { chat: async () => '{"type":"tool_call","name":"rm_rf","input":{}}' },
        tts: { speak: async () => undefined, stop: () => undefined }
      })
    ).rejects.toThrow(/Tool calling is not available/)
  })
})

describe('hands-free turn detector', () => {
  it('ignores silence until the user has started speaking', () => {
    const detector = createTurnDetector({ silenceMs: 400, minSpeechMs: 200 })
    for (let i = 0; i < 10; i++) {
      expect(detector.sample(false, 100)).toBe('continue')
    }
    expect(detector.heardSpeech).toBe(false)
  })

  it('ends the turn after speech followed by a pause', () => {
    const detector = createTurnDetector({ silenceMs: 400, minSpeechMs: 200 })
    expect(detector.sample(true, 250)).toBe('continue')
    expect(detector.sample(false, 200)).toBe('continue')
    expect(detector.sample(false, 200)).toBe('end')
  })

  it('ends the turn when captions mark speech then silence follows', () => {
    const detector = createTurnDetector({ silenceMs: 400, minSpeechMs: 200 })
    detector.markSpeech(250)
    expect(detector.heardSpeech).toBe(true)
    expect(detector.sample(false, 200)).toBe('continue')
    expect(detector.sample(false, 200)).toBe('end')
  })
})

describe('Tess wake word', () => {
  it('detects Tess and strips it from the command', async () => {
    const { matchWakeWord } = await import('@/modules/voice-assistant/core/wakeWord')
    expect(matchWakeWord('Tess what time is it')).toEqual({
      heard: true,
      command: 'what time is it'
    })
    expect(matchWakeWord('Hey Tess')).toEqual({ heard: true, command: '' })
    expect(matchWakeWord('ok tess, open notes')).toEqual({
      heard: true,
      command: 'open notes'
    })
    expect(matchWakeWord('what time is it')).toEqual({ heard: false, command: 'what time is it' })
    expect(matchWakeWord('test')).toEqual({ heard: true, command: '' })
    expect(matchWakeWord('hey tessa what time is it')).toEqual({
      heard: true,
      command: 'what time is it'
    })
    expect(matchWakeWord('tese')).toEqual({ heard: true, command: '' })
  })

  it('does not treat an empty transcript as a wake', async () => {
    const { matchWakeWord, isReadyPrompt, READY_LINE, ASSISTANT_NAME } = await import(
      '@/modules/voice-assistant/core/wakeWord'
    )
    expect(matchWakeWord('')).toEqual({ heard: false, command: '' })
    expect(isReadyPrompt(READY_LINE)).toBe(true)
    expect(ASSISTANT_NAME).toBe('Tess')
  })
})

describe('clipboard intent detection', () => {
  it('detects grammar, improve, summarize, and ask-about intents', async () => {
    const { detectClipboardIntent } = await import('@shared/lib/voice-clipboard-intent')
    expect(detectClipboardIntent('fix grammar')).toEqual({
      kind: 'transform',
      action: 'fix_grammar'
    })
    expect(detectClipboardIntent('improve it')).toEqual({ kind: 'transform', action: 'improve' })
    expect(detectClipboardIntent('summarize last copy')).toEqual({
      kind: 'transform',
      action: 'summarize'
    })
    expect(detectClipboardIntent('what does my last copy say')).toEqual({
      kind: 'ask_about',
      question: 'what does my last copy say'
    })
    expect(detectClipboardIntent('what time is it')).toBeNull()
  })
})

describe('note intent detection', () => {
  it('detects save-note commands', async () => {
    const { detectNoteIntent } = await import('@shared/lib/voice-note-intent')
    expect(detectNoteIntent('save note from last copy')).toMatchObject({
      kind: 'save_note',
      useClipboard: true
    })
    expect(detectNoteIntent('keep this note')).toMatchObject({ kind: 'save_note' })
    expect(detectNoteIntent('what time is it')).toBeNull()
  })

  it('detects read/list note commands', async () => {
    const { detectNoteLookupIntent } = await import('@shared/lib/voice-note-intent')
    expect(detectNoteLookupIntent('what notes do I have')).toEqual({ action: 'list' })
    expect(detectNoteLookupIntent('read the note about login')).toEqual({
      action: 'read',
      query: 'login'
    })
    expect(detectNoteLookupIntent('save note')).toBeNull()
  })
})

describe('memory and project intent', () => {
  it('detects remember commands and skips recall questions', async () => {
    const { detectRememberIntent } = await import('@shared/lib/voice-memory-intent')
    expect(detectRememberIntent('remember that the deadline is Friday')).toEqual({
      fact: 'the deadline is Friday'
    })
    expect(detectRememberIntent('what do you remember')).toBeNull()
  })

  it('detects project questions for RAG', async () => {
    const { looksLikeProjectQuestion } = await import('@shared/lib/voice-project-intent')
    expect(looksLikeProjectQuestion('what are the requirements')).toBe(true)
    expect(looksLikeProjectQuestion('what time is it')).toBe(false)
    expect(looksLikeProjectQuestion('play some music')).toBe(false)
  })
})

describe('noise gate', () => {
  it('treats a quiet room as silence and speech as speech', () => {
    const gate = createNoiseGate()
    for (let i = 0; i < 12; i++) gate.sample(0.006)
    expect(gate.sample(0.006).isSpeech).toBe(false)
    // Needs a couple attack samples of clear speech before opening.
    expect(gate.sample(0.09).isSpeech).toBe(false)
    expect(gate.sample(0.09).isSpeech).toBe(true)
  })

  it('ignores low ambient levels near the noise floor', () => {
    const gate = createNoiseGate({ minThreshold: 0.022, attackSamples: 2 })
    for (let i = 0; i < 20; i++) {
      expect(gate.sample(0.008).isSpeech).toBe(false)
    }
  })
})

describe('spoken reply text', () => {
  it('drops markdown and code from speech', async () => {
    const { toSpeakableText, splitSpeechChunks } = await import(
      '@/modules/voice-assistant/lib/speech-text'
    )
    expect(toSpeakableText('## Fix\n**Cause:** the `token` expired.\n- Retry\n```ts\nx()\n```')).toBe(
      'Fix. Cause: the token expired. Retry. I put the code on screen.'
    )
    const chunks = splitSpeechChunks('One sentence here. '.repeat(40), 100)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true)
  })

  it('only wakes on weak aliases at the start and keeps punctuation', async () => {
    const { matchWakeWord } = await import('@/modules/voice-assistant/core/wakeWord')
    expect(matchWakeWord('this is a test').heard).toBe(false)
    expect(matchWakeWord('mess up the file').heard).toBe(false)
    expect(matchWakeWord("Tess, what's the time?")).toEqual({ heard: true, command: "what's the time?" })
    expect(matchWakeWord('what time is it, Tess?')).toEqual({ heard: true, command: 'what time is it' })
    expect(matchWakeWord('test the login flow', { leadingOnly: true }).heard).toBe(false)
  })
})

describe('voice model output parsing', () => {
  it('recovers the spoken text from truncated response JSON', async () => {
    const { parseVoiceModelOutput } = await import('@shared/lib/voice-model-output')
    expect(parseVoiceModelOutput('{"type":"response","text":"It is \\"noon\\" now').text).toBe(
      'It is "noon" now'
    )
    expect(parseVoiceModelOutput('Plain answer.').text).toBe('Plain answer.')
  })
})

describe('speech-to-text setup errors', () => {
  it('shows the actionable local Whisper message instead of the generic one', async () => {
    const { classifySttError } = await import('@shared/lib/voice-errors')
    const missing = classifySttError(
      new Error('Whisper base.en is not installed. Download it from Voice settings.')
    )
    expect(missing).toEqual({
      code: 'stt-unavailable',
      message: 'Whisper base.en is not installed. Download it from Voice settings.'
    })
    expect(classifySttError(new Error('boom')).message).toMatch(/not ready/)
  })
})

describe('speech recognition readiness', () => {
  const model = (id: 'whisper-base.en' | 'whisper-small', installed: boolean, engineReady = true) => ({
    id,
    label: id === 'whisper-small' ? 'Whisper small' : 'Whisper base.en',
    sizeBytes: 142 * 1024 * 1024,
    installed,
    engineReady,
    downloading: false,
    progress: null,
    path: ''
  })

  it('offers the installed model when the selected one was never downloaded', async () => {
    const { sttReadiness } = await import('@shared/lib/voice-stt-readiness')
    const { DEFAULT_VOICE_ASSISTANT_SETTINGS } = await import('@shared/types/voice-assistant')
    const result = sttReadiness(DEFAULT_VOICE_ASSISTANT_SETTINGS, [
      model('whisper-base.en', false),
      model('whisper-small', true)
    ])
    expect(result.ready).toBe(false)
    if (!result.ready) expect(result.action).toMatchObject({ kind: 'use-installed', model: 'small' })
  })

  it('asks to download when nothing is installed and to finish setup without the engine', async () => {
    const { sttReadiness } = await import('@shared/lib/voice-stt-readiness')
    const { DEFAULT_VOICE_ASSISTANT_SETTINGS } = await import('@shared/types/voice-assistant')
    const none = sttReadiness(DEFAULT_VOICE_ASSISTANT_SETTINGS, [model('whisper-base.en', false)])
    if (!none.ready) expect(none.action.kind).toBe('download')
    const noEngine = sttReadiness(DEFAULT_VOICE_ASSISTANT_SETTINGS, [model('whisper-base.en', true, false)])
    if (!noEngine.ready) expect(noEngine.action.kind).toBe('finish-setup')
    expect(sttReadiness(DEFAULT_VOICE_ASSISTANT_SETTINGS, [model('whisper-base.en', true)]).ready).toBe(true)
  })

  it('strips whisper.cpp non-speech markers', async () => {
    const { cleanWhisperOutput } = await import('../electron/main/voice-assistant/stt/whisper-cli')
    expect(cleanWhisperOutput(' [BLANK_AUDIO]\n What time is it?\n')).toBe('What time is it?')
  })
})
