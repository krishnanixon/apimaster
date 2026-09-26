import { importedFileToHtml, titleFromFileName } from '@/features/documents/lib/import-document'

export const IMPORT_FILE_ACCEPT =
  '.docx,.docm,.pdf,.txt,.md,.markdown,.html,.htm,.json'

export type ImportSourceKind = 'pdf' | 'word' | 'text'

export type ImportProgressStep =
  | 'reading'
  | 'converting'
  | 'preparing'
  | 'done'

export interface ImportProgress {
  step: ImportProgressStep
  label: string
  detail?: string
  fileName: string
  kind: ImportSourceKind
}

export interface ImportedSource {
  html: string
  text: string
  title: string
  fileName: string
  kind: ImportSourceKind
  pageCount?: number
  /** App-managed copy of the original imported PDF. */
  savedFilePath?: string
}

function stripToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function isWordFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.docx') || lower.endsWith('.docm')
}

function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
}

function detectKind(fileName: string): ImportSourceKind {
  if (isPdfFile(fileName)) return 'pdf'
  if (isWordFile(fileName)) return 'word'
  return 'text'
}

function yieldPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 0)
    }
  })
}

export async function readImportedFile(
  file: File,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportedSource> {
  const fileName = file.name
  const lower = fileName.toLowerCase()
  const kind = detectKind(fileName)

  const report = async (step: ImportProgressStep, label: string, detail?: string) => {
    onProgress?.({ step, label, detail, fileName, kind })
    await yieldPaint()
  }

  if (lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.docm')) {
    throw new Error('Legacy .doc files are not supported. Save as .docx in Word and try again.')
  }

  await report('reading', 'Reading file…', fileName)

  if (isPdfFile(fileName)) {
    const parsePdf = window.electronAPI?.documents?.parsePdf
    if (!parsePdf) {
      throw new Error('PDF import is only available in the desktop app.')
    }
    await report('converting', 'Converting PDF to text…', 'Extracting pages')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await parsePdf({ fileName, bytes })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Could not read PDF file')
    }
    await report(
      'preparing',
      'Preparing document…',
      result.data.pageCount ? `${result.data.pageCount} page${result.data.pageCount === 1 ? '' : 's'}` : undefined
    )
    await report('done', 'PDF converted', result.data.title)
    return { ...result.data, fileName, kind: 'pdf' }
  }

  if (isWordFile(fileName)) {
    const parseWord = window.electronAPI?.documents?.parseWord
    if (!parseWord) {
      throw new Error('Word import is only available in the desktop app.')
    }
    await report('converting', 'Converting Word to text…', 'Parsing document')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await parseWord({ fileName, bytes })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Could not read Word file')
    }
    await report('preparing', 'Preparing document…')
    await report('done', 'Word converted', result.data.title)
    return { ...result.data, fileName, kind: 'word' }
  }

  await report('converting', 'Reading text file…')
  const contents = await file.text()
  await report('preparing', 'Preparing document…')
  const html = importedFileToHtml(fileName, contents)
  const source: ImportedSource = {
    html,
    text: stripToText(html) || contents.trim(),
    title: titleFromFileName(fileName),
    fileName,
    kind: 'text'
  }
  await report('done', 'File ready', source.title)
  return source
}
