const URL_PATTERN = /^(https?:\/\/|ftp:\/\/|www\.)[\w\-._~:/?#[\]@!$&'()*+,;=%]+$/i

function ensureAppApi() {
  if (typeof window === 'undefined' || !window.electronAPI?.app) {
    throw new Error('App API is unavailable.')
  }
  return window.electronAPI.app
}

function normalizeUrl(text: string): string {
  const trimmed = text.trim()
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

export function buildWebSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`
}

export function resolveWebNavigationUrl(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Nothing to search')

  if (URL_PATTERN.test(trimmed) || /^https?:\/\/\S+$/i.test(trimmed)) {
    return normalizeUrl(trimmed)
  }

  return buildWebSearchUrl(trimmed)
}

export async function openWebSearch(query: string): Promise<void> {
  const url = resolveWebNavigationUrl(query)
  await ensureAppApi().openExternal(url)
}
