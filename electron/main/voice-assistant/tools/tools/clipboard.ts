import { clipboard } from 'electron'
import type { AssistantTool } from '../types'
import {
  deliverTransformedText,
  preparePasteTarget,
  readClipboardText,
  transformClipboardText
} from '../../clipboardAssist'
import { voiceSettingsStore } from '../../settings.store'

export const copyToClipboardTool: AssistantTool = {
  name: 'copy_to_clipboard',
  description: 'Copy text to the system clipboard.',
  riskLevel: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to copy' }
    },
    required: ['text'],
    additionalProperties: false
  },
  async execute(input) {
    const text = String((input as { text: string }).text)
    clipboard.writeText(text)
    return { ok: true, output: 'Copied to clipboard.' }
  }
}

export const getClipboardTool: AssistantTool = {
  name: 'get_clipboard',
  description:
    'Read the last copied text from the project Clipboard history (falls back to the system clipboard). Use when the user asks about what they copied.',
  riskLevel: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async execute() {
    const text = readClipboardText()
    if (!text) return { ok: true, output: 'Clipboard is empty.' }
    return { ok: true, output: text }
  }
}

export const pasteTextTool: AssistantTool = {
  name: 'paste_text',
  description:
    'Write text to the clipboard and paste it into the focused typing field (or the previous app) when possible.',
  riskLevel: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to paste' }
    },
    required: ['text'],
    additionalProperties: false
  },
  async execute(input) {
    const text = String((input as { text: string }).text)
    await preparePasteTarget()
    const deliver = await deliverTransformedText(text)
    if (deliver.pasted) return { ok: true, output: `Pasted (${deliver.mode}).` }
    return { ok: true, output: 'Copied to clipboard. Could not auto-paste into a focused field.' }
  }
}

export const transformClipboardTool: AssistantTool = {
  name: 'transform_clipboard',
  description:
    'Transform the last copied clipboard text: fix_grammar, improve, or summarize — then paste the result at the focused cursor when possible.',
  riskLevel: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'One of: fix_grammar, improve, summarize'
      }
    },
    required: ['action'],
    additionalProperties: false
  },
  async execute(input) {
    const actionRaw = String((input as { action: string }).action || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
    const action =
      actionRaw === 'fix_grammar' || actionRaw === 'improve' || actionRaw === 'summarize'
        ? actionRaw
        : null
    if (!action) {
      return { ok: false, output: 'action must be fix_grammar, improve, or summarize.' }
    }
    const source = readClipboardText()
    if (!source) return { ok: false, output: 'Clipboard is empty.' }
    const settings = voiceSettingsStore.get()
    const result = await transformClipboardText(action, source, settings)
    const deliver = await deliverTransformedText(result)
    return {
      ok: true,
      output: deliver.pasted
        ? `Done and pasted (${deliver.mode}). Result:\n${result.slice(0, 2000)}`
        : `Done and copied. Result:\n${result.slice(0, 2000)}`
    }
  }
}
