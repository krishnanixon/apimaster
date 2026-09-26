import { useMemo, useState } from 'react'
import { Check, Copy, LayoutGrid } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

interface DocumentCard {
  title: string
  html: string
}

function splitIntoCards(html: string): DocumentCard[] {
  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  const cards: DocumentCard[] = []
  let title = 'Overview'
  let nodes: string[] = []
  const flush = () => {
    if (!nodes.length) return
    cards.push({ title, html: nodes.join('') })
    nodes = []
  }
  for (const node of Array.from(documentNode.body.children)) {
    const explicitBreak = node.tagName === 'HR' && node.getAttribute('data-page-break') === 'true'
    const heading = node.tagName === 'H1' || node.tagName === 'H2'
    if (explicitBreak) {
      flush()
      title = `Section ${cards.length + 1}`
      continue
    }
    if (heading) {
      flush()
      title = node.textContent?.trim() || `Section ${cards.length + 1}`
    }
    nodes.push(node.outerHTML)
  }
  flush()
  return cards.length ? cards : [{ title: 'Document', html }]
}

export function DocumentCardReader({ html }: { html: string }) {
  const cards = useMemo(() => splitIntoCards(html), [html])
  const [copied, setCopied] = useState<string | null>(null)
  return (
    <div className="h-full overflow-y-auto bg-muted/35 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            {cards.length} content cards
          </span>
          <span>Headings and page breaks define cards</span>
        </div>
        {cards.map((card, index) => (
          <article
            key={`${card.title}-${index}`}
            className="group relative overflow-hidden rounded-2xl border bg-background shadow-sm"
          >
            <header className="flex items-center justify-between border-b bg-muted/25 px-5 py-3">
              <div>
                <span className="mr-2 text-[10px] text-muted-foreground">{index + 1}</span>
                <span className="text-sm font-semibold">{card.title}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 opacity-60 group-hover:opacity-100"
                onClick={() => {
                  void navigator.clipboard.writeText(card.html)
                  setCopied(card.title)
                  window.setTimeout(() => setCopied(null), 1200)
                }}
              >
                {copied === card.title ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === card.title ? 'Copied' : 'Copy card'}
              </Button>
            </header>
            <div
              className="tiptap document-page-content min-h-36 px-6 py-5"
              dangerouslySetInnerHTML={{ __html: card.html }}
            />
          </article>
        ))}
      </div>
    </div>
  )
}
