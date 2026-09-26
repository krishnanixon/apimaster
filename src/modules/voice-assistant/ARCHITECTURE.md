# Voice architecture (Tess + Chat voice)

There is no separate voice page. Voice shows up in two places:

- **Tess** (`components/TessBot.tsx`) — mounted once in `AppShell`, available on every page. The switch
  starts a hands-free session (`voice.store` → main-process engine with tools). With the wake word on she
  answers “Tess, …”; with it off every utterance is a question. `voice.autoStart` remembers the switch.
- **Chat voice** (`src/features/chat/hooks/useChatVoice.ts`) — dictation, a spoken back-and-forth that
  goes through the normal chat pipeline, and read-aloud. It reuses `core/dictation.ts` and `speakAloud`.

Only one listener holds the mic: chat voice ends Tess's session, Tess starting cancels chat voice, and
a `BroadcastChannel` hands the session to the newest window.

## Pipeline

```text
Voice Input → VAD (optional) → STT → Context → AI Orchestrator → Tools → TTS → Voice Output
```

State machine: `IDLE → LISTENING → PROCESSING → THINKING → SPEAKING → IDLE`. Errors recover through `ERROR` then `IDLE`. Barge-in is `SPEAKING → LISTENING`.

## Layout

| Layer | Path | Responsibility |
| --- | --- | --- |
| Shared contracts | `shared/types/voice-assistant.ts` | Settings, messages, IPC payloads |
| Shared logic | `shared/lib/voice-*.ts` | State machine, context trim, permissions, path safety |
| Main engine | `electron/main/voice-assistant/` | STT/TTS/AI/tools, persistence, IPC |
| Renderer | `src/modules/voice-assistant/` | Tess UI, microphone, dictation, system TTS / browser STT |

Secrets stay in the main process (`safeStorage` via the existing AI key service). The renderer never receives API keys.

## Adding an STT / TTS / AI provider

1. Implement `STTProvider`, `TTSProvider`, or `VoiceAIProvider`.
2. Register STT/TTS in `*-registry.ts`. Register AI in `ai/provider-registry.ts`.
3. Add the id to the settings union in `shared/types/voice-assistant.ts`.
4. Expose it in Settings → Voice (`VoiceSettingsPanel`).

OpenAI and Ollama chat go through `WorkbenchAIProvider` so the orchestrator never imports vendor SDKs. Anthropic is a stub class (`AnthropicProvider`) until an SDK is added.

Do not call vendor SDKs from React.

## Adding a tool

1. Create an `AssistantTool` with an explicit JSON schema and `riskLevel`.
2. Register it in `register-builtin.ts`.
3. Read tools run immediately. Write tools confirm unless trusted. Destructive tools always confirm.
4. Never register shell execution or unbounded filesystem access. Use `assertSafePath`.

## Future Workbench integration

`electron/main/voice-assistant/workbench/WorkbenchIntegration.ts` is the only boundary. It is a no-op today. A later adapter can implement `createProject`, `createRequirement`, `searchProject`, and `generateDocument` without the voice UI importing Workbench modules.

## Local vs cloud

- Local: Browser STT + Workbench/Ollama + System TTS
- Cloud: OpenAI Whisper + OpenAI/Workbench cloud LLM + OpenAI TTS

The UI shows a **Cloud processing** badge when any cloud hop is selected. Raw audio is not persisted unless privacy.storeAudio is enabled (not used in the MVP pipeline).
