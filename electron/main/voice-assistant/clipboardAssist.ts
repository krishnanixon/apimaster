import { clipboard, BrowserWindow } from 'electron'
import {
  captureForegroundWindowAsync,
  pasteToPreviousWindow
} from '../clipboard-manager/paste.service'
import { clipboardManagerService } from '../clipboard-manager/clipboard.service'
import { aiOrchestrator } from './ai/AIOrchestrator'
import { voiceSettingsStore } from './settings.store'
import type { VoiceAssistantSettings } from '@shared/types/voice-assistant'
import {
  type ClipboardTransformAction,
  detectClipboardIntent
} from '@shared/lib/voice-clipboard-intent'
import { logger } from '../infra/logger.service'
import { ASSISTANT_NAME } from '@shared/constants/product'

export { detectClipboardIntent }
export type { ClipboardTransformAction, ClipboardIntent } from '@shared/lib/voice-clipboard-intent'

const TRANSFORM_PROMPTS: Record<ClipboardTransformAction, string> = {
  fix_grammar:
    'Fix grammar, spelling, and punctuation only. Keep the same meaning, tone, and language. Return only the corrected text with no quotes or explanation.',
  improve:
    'Improve clarity and wording while keeping the same meaning and language. Return only the improved text with no quotes or explanation.',
  summarize:
    'Summarize the text clearly and briefly. Return only the summary with no quotes or explanation.'
}

/** Prefer the project's clipboard history last copy; fall back to OS clipboard. */
export function readClipboardText(max = 12_000): string {
  try {
    const fromProject = clipboardManagerService.getLatestText(max)
    if (fromProject) return fromProject
  } catch (error) {
    logger.warn(`Project clipboard read failed: ${error}`, 'Voice')
  }
  return clipboard.readText().trim().slice(0, max)
}

export async function preparePasteTarget(): Promise<void> {
  await captureForegroundWindowAsync()
}

function insertScript(text: string): string {
  const payload = JSON.stringify(text)
  return `(() => {
    const text = ${payload};
    const el = document.activeElement;
    if (!el) return false;
    const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (isInput) {
      if (el.disabled || el.readOnly) return false;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + text + el.value.slice(end);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, next);
      else el.value = next;
      try { el.selectionStart = el.selectionEnd = start + text.length; } catch (_) {}
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return document.execCommand('insertText', false, text);
    }
    return false;
  })()`
}

async function insertIntoFocusedEditable(text: string): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return false
  try {
    const ok = await win.webContents.executeJavaScript(insertScript(text), true)
    return Boolean(ok)
  } catch (error) {
    logger.warn(`Insert at focus failed: ${error}`, 'Voice')
    return false
  }
}

export type DeliverResult = {
  pasted: boolean
  mode: 'focus' | 'previous-app' | 'clipboard-only'
}

/** Write text to the clipboard and paste into the focused field when possible. */
export async function deliverTransformedText(text: string): Promise<DeliverResult> {
  clipboard.writeText(text)

  if (await insertIntoFocusedEditable(text)) {
    return { pasted: true, mode: 'focus' }
  }

  const pasted = await pasteToPreviousWindow()
  if (pasted) return { pasted: true, mode: 'previous-app' }

  return { pasted: false, mode: 'clipboard-only' }
}

export async function transformClipboardText(
  action: ClipboardTransformAction,
  source: string,
  settings: VoiceAssistantSettings,
  signal?: AbortSignal
): Promise<string> {
  const response = await aiOrchestrator.chat({
    settings,
    signal,
    messages: [
      {
        role: 'system',
        content: TRANSFORM_PROMPTS[action]
      },
      {
        role: 'user',
        content: source
      }
    ]
  })
  const out = response.text.trim()
  if (!out) throw new Error(`${ASSISTANT_NAME} could not transform that clipboard text.`)
  // Strip accidental wrapping quotes from some models.
  return out.replace(/^["“]|["”]$/g, '').trim()
}

export function spokenDeliverAck(action: ClipboardTransformAction, deliver: DeliverResult): string {
  const verb =
    action === 'fix_grammar' ? 'Fixed the grammar' : action === 'improve' ? 'Improved the text' : 'Summarized it'
  if (deliver.pasted) return `${verb} and pasted it where you were typing.`
  return `${verb} and copied it. Paste with Command V or Control V.`
}

export async function runClipboardTransformTurn(
  action: ClipboardTransformAction,
  signal?: AbortSignal
): Promise<{ spoken: string; resultText: string }> {
  const settings = voiceSettingsStore.get()
  const source = readClipboardText()
  if (!source) {
    return {
      spoken: 'Your clipboard is empty. Copy some text first, then ask me again.',
      resultText: ''
    }
  }

  const resultText = await transformClipboardText(action, source, settings, signal)
  const deliver = await deliverTransformedText(resultText)
  return {
    spoken: spokenDeliverAck(action, deliver),
    resultText
  }
}
