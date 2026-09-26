/** Write text to the system clipboard (Electron main process when available). */
export async function writeClipboardText(text: string): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI?.clipboard?.writeText) {
    const result = await window.electronAPI.clipboard.writeText(text)
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to copy to clipboard')
    }
    return
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  throw new Error('Clipboard is unavailable in this environment')
}
