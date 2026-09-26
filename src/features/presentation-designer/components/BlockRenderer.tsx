import type { PresentationBlock } from '@shared/types/presentation'
import { pickImageAsDataUrl } from '../lib/import-image'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'

interface BlockRendererProps {
  block: PresentationBlock
  editing?: boolean
  selected?: boolean
  onSelect?: () => void
  onChange?: (patch: Partial<PresentationBlock>) => void
}

export function BlockRenderer({
  block,
  editing = false,
  selected = false,
  onSelect,
  onChange
}: BlockRendererProps) {
  const frame = cn(
    'rounded-md transition-shadow',
    editing && 'cursor-text',
    selected && editing && 'ring-2 ring-primary/40'
  )

  switch (block.type) {
    case 'heading':
      return (
        <div className={frame} onClick={onSelect}>
          {editing ? (
            <input
              value={block.text}
              onChange={(e) => onChange?.({ text: e.target.value } as Partial<PresentationBlock>)}
              className={cn(
                'w-full bg-transparent font-semibold outline-none',
                (block.level ?? 2) === 1 && 'text-3xl',
                (block.level ?? 2) === 2 && 'text-xl',
                (block.level ?? 2) === 3 && 'text-lg'
              )}
              placeholder="Heading"
            />
          ) : (
            <Heading level={block.level ?? 2}>{block.text}</Heading>
          )}
        </div>
      )
    case 'text':
      return (
        <div className={frame} onClick={onSelect}>
          {editing ? (
            <textarea
              value={block.text}
              onChange={(e) => onChange?.({ text: e.target.value } as Partial<PresentationBlock>)}
              className="min-h-[72px] w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none"
              placeholder="Body text"
            />
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed opacity-90">{block.text}</p>
          )}
        </div>
      )
    case 'bullets':
      return (
        <div className={frame} onClick={onSelect}>
          {editing ? (
            <textarea
              value={block.items.join('\n')}
              onChange={(e) =>
                onChange?.({
                  items: e.target.value.split('\n')
                } as Partial<PresentationBlock>)
              }
              className="min-h-[100px] w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none"
              placeholder="One bullet per line"
            />
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed">
              {block.items.map((item, index) => (
                <li key={`${block.id}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )
    case 'columns':
      return (
        <div
          className={cn(frame, 'grid gap-3 sm:grid-cols-2')}
          onClick={onSelect}
        >
          {block.columns.map((column, index) => (
            <div key={`${block.id}-col-${index}`} className="rounded-lg border border-current/10 p-3">
              {editing ? (
                <>
                  <input
                    value={column.title ?? ''}
                    onChange={(e) => {
                      const columns = block.columns.map((col, i) =>
                        i === index ? { ...col, title: e.target.value } : col
                      )
                      onChange?.({ columns } as Partial<PresentationBlock>)
                    }}
                    className="mb-1 w-full bg-transparent text-sm font-semibold outline-none"
                    placeholder="Column title"
                  />
                  <textarea
                    value={column.body}
                    onChange={(e) => {
                      const columns = block.columns.map((col, i) =>
                        i === index ? { ...col, body: e.target.value } : col
                      )
                      onChange?.({ columns } as Partial<PresentationBlock>)
                    }}
                    className="min-h-[64px] w-full resize-y bg-transparent text-sm outline-none"
                    placeholder="Column body"
                  />
                </>
              ) : (
                <>
                  {column.title && <h4 className="mb-1 text-sm font-semibold">{column.title}</h4>}
                  <p className="text-sm leading-relaxed opacity-90">{column.body}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )
    case 'callout':
      return (
        <aside
          className={cn(
            frame,
            'border-l-4 border-current/40 bg-black/5 px-3 py-2 text-sm dark:bg-white/5'
          )}
          onClick={onSelect}
        >
          {editing ? (
            <textarea
              value={block.text}
              onChange={(e) => onChange?.({ text: e.target.value } as Partial<PresentationBlock>)}
              className="min-h-[56px] w-full resize-y bg-transparent outline-none"
              placeholder="Callout"
            />
          ) : (
            block.text
          )}
        </aside>
      )
    case 'divider':
      return <hr className="my-2 border-current/15" onClick={onSelect} />
    case 'metric':
      return (
        <div
          className={cn(frame, 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}
          onClick={onSelect}
        >
          {block.metrics.map((metric, index) => (
            <div
              key={`${block.id}-m-${index}`}
              className="rounded-xl border border-current/10 p-3"
            >
              {editing ? (
                <div className="space-y-1">
                  <input
                    value={metric.value}
                    onChange={(e) => {
                      const metrics = block.metrics.map((m, i) =>
                        i === index ? { ...m, value: e.target.value } : m
                      )
                      onChange?.({ metrics } as Partial<PresentationBlock>)
                    }}
                    className="w-full bg-transparent text-2xl font-bold outline-none"
                    placeholder="Value"
                  />
                  <input
                    value={metric.label}
                    onChange={(e) => {
                      const metrics = block.metrics.map((m, i) =>
                        i === index ? { ...m, label: e.target.value } : m
                      )
                      onChange?.({ metrics } as Partial<PresentationBlock>)
                    }}
                    className="w-full bg-transparent text-xs outline-none opacity-70"
                    placeholder="Label"
                  />
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold">{metric.value}</div>
                  <div className="text-xs opacity-70">{metric.label}</div>
                  {metric.hint && <div className="mt-1 text-[11px] opacity-60">{metric.hint}</div>}
                </>
              )}
            </div>
          ))}
        </div>
      )
    case 'image':
      return (
        <figure className={frame} onClick={onSelect}>
          {block.src ? (
            <div className="space-y-2">
              <img
                src={block.src}
                alt={block.alt ?? ''}
                className="max-h-72 w-full rounded-lg object-cover"
              />
              {editing && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const picked = await pickImageAsDataUrl()
                      if (picked) {
                        onChange?.({
                          src: picked.src,
                          alt: block.alt || picked.name
                        } as Partial<PresentationBlock>)
                      }
                    }}
                  >
                    Replace image
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onChange?.({ src: undefined } as Partial<PresentationBlock>)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-current/20 px-3 text-sm opacity-80">
              <span>{block.alt || block.caption || 'No image yet'}</span>
              {editing && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={async (e) => {
                    e.stopPropagation()
                    const picked = await pickImageAsDataUrl()
                    if (picked) {
                      onChange?.({
                        src: picked.src,
                        alt: picked.name
                      } as Partial<PresentationBlock>)
                    }
                  }}
                >
                  Import image
                </Button>
              )}
            </div>
          )}
          {(block.caption || editing) && (
            <figcaption className="mt-1 text-xs opacity-60">
              {editing ? (
                <input
                  value={block.caption ?? ''}
                  onChange={(e) =>
                    onChange?.({ caption: e.target.value } as Partial<PresentationBlock>)
                  }
                  className="w-full bg-transparent outline-none"
                  placeholder="Caption"
                />
              ) : (
                block.caption
              )}
            </figcaption>
          )}
        </figure>
      )
    default:
      return null
  }
}

function Heading({ level, children }: { level: 1 | 2 | 3; children: string }) {
  if (level === 1) return <h1 className="text-3xl font-semibold tracking-tight">{children}</h1>
  if (level === 3) return <h3 className="text-lg font-semibold">{children}</h3>
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>
}
