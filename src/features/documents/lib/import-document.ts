function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inList = false
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const closeList = () => {
    if (!inList) return
    html.push('</ul>')
    inList = false
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph()
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`)
      continue
    }

    closeList()
    paragraph.push(line.trim())
  }

  flushParagraph()
  closeList()
  return html.join('\n')
}

export function importedFileToHtml(fileName: string, contents: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return contents
  if (lower.endsWith('.json')) {
    try {
      const parsed = JSON.parse(contents) as { htmlContent?: string; content?: string; title?: string }
      return parsed.htmlContent || parsed.content || `<pre>${escapeHtml(contents)}</pre>`
    } catch {
      return `<pre>${escapeHtml(contents)}</pre>`
    }
  }
  return markdownToHtml(contents)
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported document'
}
