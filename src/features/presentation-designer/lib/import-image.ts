import { usePresentationStore } from '../stores/presentation.store'

/** Pick a local image file and persist it as a managed presentation asset when possible. */
export function pickImageAsDataUrl(options?: {
  maxBytes?: number
}): Promise<{ src: string; name: string } | null> {
  const maxBytes = options?.maxBytes ?? 8 * 1024 * 1024
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      if (file.size > maxBytes) {
        window.alert('Image must be smaller than 8 MB.')
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        void (async () => {
          try {
            const presentationId = usePresentationStore.getState().currentPresentation?.id
            const api = window.electronAPI?.presentations
            if (presentationId && api?.importAsset) {
              const imported = await api.importAsset(presentationId, file.name, dataUrl)
              if (imported.success && imported.data) {
                resolve({ src: imported.data.src, name: file.name })
                return
              }
            }
          } catch {
            // Browser preview and older desktop bridges keep the data URL fallback.
          }
          resolve({ src: dataUrl, name: file.name })
        })()
      }
      reader.onerror = () => {
        window.alert('Failed to read image file.')
        resolve(null)
      }
      reader.readAsDataURL(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
