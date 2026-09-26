import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ListTree } from 'lucide-react'
import { extractOutlineFromEditor } from '@/features/editor/lib/document-outline'
import { cn } from '@/shared/lib/utils'

export function TocNodeView({ editor, selected }: NodeViewProps) {
  const items = editor ? extractOutlineFromEditor(editor).filter((item) => item.level <= 3) : []

  return (
    <NodeViewWrapper
      className={cn('doc-toc-node', selected && 'is-selected')}
      data-type="table-of-contents"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" />
        Table of contents
      </div>
      {items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Add headings to populate this list.</p>
      ) : (
        <ol className="m-0 list-none space-y-0.5 p-0">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                contentEditable={false}
                onClick={() => {
                  editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run()
                }}
                className={cn(
                  'block w-full truncate rounded px-1 py-0.5 text-left text-sm hover:bg-muted',
                  item.level === 1 && 'font-semibold',
                  item.level === 2 && 'pl-4 text-[13px]',
                  item.level === 3 && 'pl-8 text-xs text-muted-foreground'
                )}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  )
}
