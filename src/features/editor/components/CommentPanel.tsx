import { useMemo, useState } from 'react'
import { Check, MessageSquare, RotateCcw, Trash2 } from 'lucide-react'
import type { DocumentComment } from '@shared/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

interface CommentPanelProps {
  comments?: DocumentComment[]
  activeId?: string | null
  onAddComment?: () => void
  onSelect: (id: string) => void
  onReply: (id: string, body: string) => void
  onResolve: (id: string) => void
  onReopen: (id: string) => void
  onDelete: (id: string) => void
}

export function CommentPanel({
  comments = [],
  activeId,
  onAddComment,
  onSelect,
  onReply,
  onResolve,
  onReopen,
  onDelete
}: CommentPanelProps) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [showResolved, setShowResolved] = useState(false)
  const threads = Array.isArray(comments) ? comments : []

  const visible = useMemo(
    () => threads.filter((comment) => (showResolved ? true : !comment.resolved)),
    [threads, showResolved]
  )
  const resolvedCount = threads.filter((comment) => comment.resolved).length

  if (threads.length === 0) {
    return (
      <div className="py-6 text-center">
        <MessageSquare className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">
          Select text in the document, then add a comment to start a review thread.
        </p>
        {onAddComment && (
          <Button type="button" variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={onAddComment}>
            Add comment
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {onAddComment && (
        <Button type="button" variant="outline" size="sm" className="h-7 w-full text-xs" onClick={onAddComment}>
          Add comment on selection
        </Button>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {visible.length} {showResolved ? 'threads' : 'open'}
        </p>
        {resolvedCount > 0 && (
          <button
            type="button"
            className="text-[10px] text-primary hover:underline"
            onClick={() => setShowResolved((value) => !value)}
          >
            {showResolved ? 'Hide resolved' : `Show ${resolvedCount} resolved`}
          </button>
        )}
      </div>
      {visible.map((comment) => (
        <article
          key={comment.id}
          className={cn(
            'rounded-md border border-border/80 p-2',
            activeId === comment.id && 'border-primary/60 bg-primary/5',
            comment.resolved && 'opacity-70'
          )}
        >
          <button type="button" className="w-full text-left" onClick={() => onSelect(comment.id)}>
            {comment.quote && (
              <p className="mb-1 line-clamp-2 border-l-2 border-amber-400 pl-1.5 text-[11px] italic text-muted-foreground">
                {comment.quote}
              </p>
            )}
            <p className="text-xs">{comment.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {comment.author} · {new Date(comment.createdAt).toLocaleString()}
            </p>
          </button>
          {comment.replies?.length > 0 && (
            <div className="mt-1.5 space-y-1 border-t border-border/60 pt-1.5">
              {(comment.replies ?? []).map((reply) => (
                <p key={reply.id} className="text-[11px]">
                  <span className="font-medium">{reply.author}: </span>
                  {reply.body}
                </p>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1">
            {comment.resolved ? (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => onReopen(comment.id)}>
                <RotateCcw className="h-3 w-3" /> Reopen
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => onResolve(comment.id)}>
                <Check className="h-3 w-3" /> Resolve
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-1.5 text-[10px] text-destructive"
              onClick={() => onDelete(comment.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {!comment.resolved && (
            <form
              className="mt-1 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                const body = (replyDrafts[comment.id] ?? '').trim()
                if (!body) return
                onReply(comment.id, body)
                setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: '' }))
              }}
            >
              <Input
                value={replyDrafts[comment.id] ?? ''}
                onChange={(e) => setReplyDrafts((drafts) => ({ ...drafts, [comment.id]: e.target.value }))}
                placeholder="Reply…"
                className="h-6 text-[11px]"
              />
              <Button type="submit" variant="outline" size="sm" className="h-6 px-2 text-[10px]">
                Reply
              </Button>
            </form>
          )}
        </article>
      ))}
    </div>
  )
}
