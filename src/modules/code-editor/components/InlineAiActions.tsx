import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Check, Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { useCodeEditorStore } from '../stores/codeEditor.store'
import { useAgentStore } from '../stores/agent.store'
import { useInlineEditStore, type InlineAiMode } from '../stores/inlineEdit.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'

export function InlineAiActions() {
  const activeTab = useCodeEditorStore((s) => s.tabs.find((t) => t.path === s.activeTabPath))
  const cursor = useCodeEditorStore((s) => s.cursor)
  const selectedCode = useCodeEditorStore((s) => s.selectedCode)
  const inlineOpen = useWorkbenchLayoutStore((s) => s.inlineEditOpen)

  const status = useInlineEditStore((s) => s.status)
  const mode = useInlineEditStore((s) => s.mode)
  const proposed = useInlineEditStore((s) => s.proposed)
  const answer = useInlineEditStore((s) => s.answer)
  const error = useInlineEditStore((s) => s.error)
  const original = useInlineEditStore((s) => s.original)
  const anchor = useInlineEditStore((s) => s.anchor)
  const setMode = useInlineEditStore((s) => s.setMode)
  const submit = useInlineEditStore((s) => s.submit)
  const accept = useInlineEditStore((s) => s.accept)
  const reject = useInlineEditStore((s) => s.reject)
  const close = useInlineEditStore((s) => s.close)

  const [prompt, setPrompt] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const sessionOpen = status !== 'idle' || inlineOpen
  const reviewing = status === 'streaming' || status === 'ready' || status === 'error'
  const canAccept = mode === 'edit' ? status === 'ready' && Boolean(proposed) : status === 'ready'
  const hasSelection = Boolean(original.trim() || selectedCode.trim())

  useEffect(() => {
    if (sessionOpen && !reviewing) inputRef.current?.focus()
  }, [sessionOpen, reviewing])

  useEffect(() => {
    if (!sessionOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (status === 'ready') {
          event.preventDefault()
          accept()
        } else if (status === 'prompt' && prompt.trim()) {
          event.preventDefault()
          submit(prompt)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [sessionOpen, status, prompt, accept, close, submit])

  if (typeof document === 'undefined' || !sessionOpen) return null

  const loc = activeTab ? `${activeTab.name}${cursor ? `:${cursor.line}` : ''}` : 'editor'
  const title = mode === 'ask' ? 'Ask AI' : hasSelection ? 'Edit selection' : 'Edit at cursor'

  const send = () => {
    const instruction = prompt.trim()
    if (!instruction) return
    submit(instruction)
  }

  const chooseMode = (next: InlineAiMode) => {
    if (status === 'streaming') return
    setMode(next)
    if (status === 'ready' || status === 'error') {
      useInlineEditStore.getState().openPrompt(next)
    }
  }

  const top = anchor?.top ?? 96
  const left = Math.min(anchor?.left ?? 48, window.innerWidth - 28)

  return createPortal(
    <div
      className="fixed z-[80] w-[min(520px,calc(100vw-24px))] rounded-lg border border-[var(--wb-border)] bg-[var(--wb-sidebar)] shadow-2xl"
      data-inline-ai-modal
      style={{
        top: Math.min(Math.max(8, top), window.innerHeight - 240),
        left: Math.min(Math.max(12, left), window.innerWidth - 24),
        transform: left > window.innerWidth / 2 ? 'translateX(-100%)' : undefined
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
        <div className="flex items-center gap-1.5 border-b border-[var(--wb-border)] px-2 py-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-medium">{title}</span>
          <span className="truncate text-[11px] text-muted-foreground">{loc}</span>
          <div className="ml-auto flex items-center rounded-md border border-[var(--wb-border)] p-0.5">
            <ModeButton
              active={mode === 'edit'}
              disabled={status === 'streaming'}
              icon={<Pencil className="h-3 w-3" />}
              label="Edit"
              onClick={() => chooseMode('edit')}
            />
            <ModeButton
              active={mode === 'ask'}
              disabled={status === 'streaming'}
              icon={<Bot className="h-3 w-3" />}
              label="Ask"
              onClick={() => chooseMode('ask')}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Close (Esc)"
            onClick={() => close()}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {reviewing ? (
          <div className="flex flex-col gap-2 px-2 py-2">
            {status === 'streaming' ? (
              <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {mode === 'ask' ? 'Thinking…' : `Rewriting… ${proposed.split('\n').length} lines`}
              </p>
            ) : status === 'error' ? (
              <p className="text-[12px] text-destructive">{error ?? 'Inline AI failed'}</p>
            ) : mode === 'ask' ? (
              <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--wb-border)] bg-[var(--wb-editor)] px-2 py-1.5 text-[12px] leading-relaxed">
                {answer}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Review the red/green diff in the editor, then accept or reject.
              </p>
            )}
            {status === 'streaming' && mode === 'ask' && answer ? (
              <div className="max-h-36 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                {answer}
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-1.5">
              {mode === 'ask' && status === 'ready' && answer ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => {
                    const editor = useCodeEditorStore.getState()
                    const tab = editor.tabs.find((t) => t.path === editor.activeTabPath)
                    const selection = (original || selectedCode).trim()
                    useAgentStore.getState().setMode('ask')
                    useAgentStore.getState().setDraft(
                      `${prompt.trim() || 'Follow up on this explanation'}\n\nEarlier inline answer:\n${answer.slice(0, 3_000)}${
                        selection
                          ? `\n\nSelection from ${tab?.name ?? 'editor'}:\n${selection.slice(0, 2_000)}`
                          : ''
                      }`
                    )
                    useWorkbenchLayoutStore.getState().openAgent()
                    close()
                  }}
                >
                  <Bot className="h-3 w-3" /> Agent
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => reject()}>
                Reject
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!canAccept}
                onClick={() => accept()}
              >
                <Check className="h-3 w-3" /> Accept
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {mode === 'edit' && status === 'ready'
                ? 'Tab or Ctrl+Enter accepts · Esc rejects · Ctrl+K closes'
                : 'Esc or Ctrl+K closes'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-2 py-2">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={
                mode === 'ask'
                  ? hasSelection
                    ? 'Ask about the selected code…'
                    : 'Ask about the code at the cursor…'
                  : hasSelection
                    ? 'Describe how to change the selection…'
                    : 'Describe code to insert at the cursor…'
              }
              className="min-h-[72px] w-full resize-none rounded-md border border-[var(--wb-border)] bg-[var(--wb-editor)] px-2 py-1.5 text-[12px] outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  close()
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                  e.preventDefault()
                  close()
                }
              }}
            />
            <div className="flex items-center justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => close()}>
                Close
              </Button>
              <Button size="sm" className="h-7 px-2 text-[11px]" disabled={!prompt.trim()} onClick={send}>
                {mode === 'ask' ? 'Ask' : 'Edit'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Enter to submit · Shift+Enter newline · Esc / Ctrl+K closes</p>
          </div>
        )}
    </div>,
    document.body
  )
}

function ModeButton({
  active,
  disabled,
  icon,
  label,
  onClick
}: {
  active: boolean
  disabled?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
        active ? 'bg-[var(--wb-hover)] font-medium text-[var(--wb-fg)]' : 'text-[var(--wb-muted)] hover:text-[var(--wb-fg)]'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
