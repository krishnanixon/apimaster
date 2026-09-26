const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]+/g

/** File-system safe Word document name without an extension. */
export function sanitizeWordFileName(title: string): string {
  const cleaned = (title || 'document')
    .replace(INVALID_NAME, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned.slice(0, 80) || 'document'
}

/** Build `{folder}/{title}.docx`, uniquing with the document id when needed. */
export function wordFileNameForDocument(title: string, documentId?: string): string {
  const base = sanitizeWordFileName(title)
  const suffix = documentId ? `-${documentId.slice(0, 8)}` : ''
  return `${base}${suffix}.docx`
}

export function joinFolderFile(folderPath: string, fileName: string): string {
  const folder = folderPath.replace(/[/\\]+$/, '')
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/'
  return `${folder}${sep}${fileName}`
}
