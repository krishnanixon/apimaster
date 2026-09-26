function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Turn pasted notes/Markdown into editable, heading-based document cards. */
export function pastedTextToDocumentHtml(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let list: string[] = []
  const flushList = () => {
    if (!list.length) return
    output.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
    list = []
  }
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      continue
    }
    if (line === '/split' || /^-{3,}$/.test(line)) {
      flushList()
      output.push('<hr data-page-break="true" />')
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushList()
      const level = heading[1].length
      output.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`)
      continue
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/)
    if (bullet) {
      list.push(bullet[1])
      continue
    }
    flushList()
    output.push(`<p>${escapeHtml(line)}</p>`)
  }
  flushList()
  return output.join('\n')
}
