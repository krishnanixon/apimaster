import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { Command } from 'cmdk'
import { insertImageFromFile, insertImageFromUrl } from '@/features/editor/lib/insert-media'
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ListChecks,
  Table as TableIcon,
  Minus,
  Code2,
  Image as ImageIcon,
  Sparkles,
  BookMarked,
  MessageSquareText,
  Quote,
  ListTree,
  ShieldAlert,
  Scale,
  CircleHelp,
  BookOpen,
  GitCommitHorizontal,
  ClipboardList,
  FileText,
  Hash,
  SplitSquareHorizontal,
  AlertTriangle,
  Info,
  GitBranch
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import {
  acceptanceCriteriaSnippet,
  approvalTableSnippet,
  assumptionTableSnippet,
  changeLogSnippet,
  coverHeaderSnippet,
  decisionLogSnippet,
  documentControlSnippet,
  glossarySnippet,
  insertHtml,
  nextRequirementId,
  nfrTableSnippet,
  openQuestionsSnippet,
  requirementSnippet,
  riskTableSnippet,
  traceabilitySnippet,
  userStorySnippet
} from '@/features/editor/lib/insert-snippets'

type Props = {
  editor: Editor
  onAskAI?: (draft: string) => void
  snippetContext?: { title?: string; projectName?: string; typeLabel?: string; status?: string }
}

type CmdItem = {
  id: string
  label: string
  keywords?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

export function SlashCommandMenu({ editor, onAskAI, snippetContext }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const { projectId } = useParams<{ projectId: string }>()

  const insertNewFlowchart = async () => {
    const title = window.prompt('Flowchart title', 'Request flow') || 'Flowchart'
    let flowId = ''
    if (projectId && window.electronAPI?.flows) {
      const result = await window.electronAPI.flows.create({
        projectId,
        title,
        description: 'Embedded document flowchart',
        category: 'process'
      })
      if (result.success && result.data) flowId = result.data.id
      else toast.error(result.error ?? 'Failed to create flowchart')
    }
    editor.chain().focus().insertFlowBlock({ flowId, title, height: 360 }).run()
  }

  const linkExistingFlow = async () => {
    if (!projectId || !window.electronAPI?.flows) {
      toast.error('Open a project document to link a flowchart')
      return
    }
    const list = await window.electronAPI.flows.list(projectId)
    if (!list.success || !list.data?.length) {
      toast.error('No flows in this project yet')
      return
    }
    const choices = list.data.map((f, i) => `${i + 1}. ${f.title}`).join('\n')
    const pick = window.prompt(`Link existing flow (enter number):\n${choices}`, '1')
    const index = Number(pick) - 1
    const flow = list.data[index]
    if (!flow) return
    editor
      .chain()
      .focus()
      .insertFlowBlock({ flowId: flow.id, title: flow.title, height: 360 })
      .run()
  }

  const items: CmdItem[] = useMemo(
    () => [
      {
        id: 'h1',
        label: 'Heading 1',
        keywords: 'title header',
        icon: Heading1,
        run: () => editor.chain().focus().toggleHeading({ level: 1 }).run()
      },
      {
        id: 'h2',
        label: 'Heading 2',
        keywords: 'section header',
        icon: Heading2,
        run: () => editor.chain().focus().toggleHeading({ level: 2 }).run()
      },
      {
        id: 'h3',
        label: 'Heading 3',
        keywords: 'subsection',
        icon: Heading3,
        run: () => editor.chain().focus().toggleHeading({ level: 3 }).run()
      },
      {
        id: 'h4',
        label: 'Heading 4',
        keywords: 'subheading',
        icon: Heading4,
        run: () => editor.chain().focus().toggleHeading({ level: 4 }).run()
      },
      {
        id: 'table',
        label: 'Table (3×3)',
        keywords: 'grid',
        icon: TableIcon,
        run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      },
      {
        id: 'checklist',
        label: 'Checklist',
        keywords: 'todo tasks',
        icon: ListChecks,
        run: () => editor.chain().focus().toggleTaskList().run()
      },
      {
        id: 'divider',
        label: 'Divider',
        keywords: 'hr separator',
        icon: Minus,
        run: () => editor.chain().focus().setHorizontalRule().run()
      },
      {
        id: 'code',
        label: 'Code block',
        keywords: 'snippet',
        icon: Code2,
        run: () => editor.chain().focus().toggleCodeBlock().run()
      },
      {
        id: 'image-file',
        label: 'Image from file',
        keywords: 'media upload photo',
        icon: ImageIcon,
        run: () => insertImageFromFile(editor)
      },
      {
        id: 'image-url',
        label: 'Image from URL',
        keywords: 'media link',
        icon: ImageIcon,
        run: () => {
          const url = window.prompt('Image URL')
          if (url) insertImageFromUrl(editor, url)
        }
      },
      {
        id: 'flowchart-new',
        label: 'Flowchart (new)',
        keywords: 'diagram flow process sdd system design',
        icon: GitBranch,
        run: () => {
          void insertNewFlowchart()
        }
      },
      {
        id: 'flowchart-link',
        label: 'Flowchart (link existing)',
        keywords: 'diagram embed flow designer',
        icon: GitBranch,
        run: () => {
          void linkExistingFlow()
        }
      },
      {
        id: 'req',
        label: 'Requirement block',
        keywords: 'req id shall acceptance',
        icon: BookMarked,
        run: () => insertHtml(editor, requirementSnippet(nextRequirementId(editor.getHTML())))
      },
      {
        id: 'story',
        label: 'User story',
        keywords: 'agile persona as a',
        icon: MessageSquareText,
        run: () => insertHtml(editor, userStorySnippet())
      },
      {
        id: 'ac',
        label: 'Acceptance criteria',
        keywords: 'given when then',
        icon: ListChecks,
        run: () => insertHtml(editor, acceptanceCriteriaSnippet())
      },
      {
        id: 'nfr',
        label: 'NFR table',
        keywords: 'performance security',
        icon: ShieldAlert,
        run: () => insertHtml(editor, nfrTableSnippet())
      },
      {
        id: 'risk',
        label: 'Risk table',
        keywords: 'mitigation',
        icon: ShieldAlert,
        run: () => insertHtml(editor, riskTableSnippet())
      },
      {
        id: 'assumptions',
        label: 'Assumptions table',
        keywords: 'constraint premise',
        icon: ClipboardList,
        run: () => insertHtml(editor, assumptionTableSnippet())
      },
      {
        id: 'decision',
        label: 'Decision log',
        keywords: 'adr rationale',
        icon: Scale,
        run: () => insertHtml(editor, decisionLogSnippet())
      },
      {
        id: 'glossary',
        label: 'Glossary',
        keywords: 'term definition',
        icon: BookOpen,
        run: () => insertHtml(editor, glossarySnippet())
      },
      {
        id: 'changelog',
        label: 'Change log',
        keywords: 'revision history version',
        icon: GitCommitHorizontal,
        run: () => insertHtml(editor, changeLogSnippet())
      },
      {
        id: 'questions',
        label: 'Open questions',
        keywords: 'todo unresolved',
        icon: CircleHelp,
        run: () => insertHtml(editor, openQuestionsSnippet())
      },
      {
        id: 'note',
        label: 'Note callout',
        keywords: 'quote assumption callout',
        icon: Quote,
        run: () => editor.chain().focus().setCallout('note').run()
      },
      {
        id: 'warning',
        label: 'Warning callout',
        keywords: 'alert caution',
        icon: AlertTriangle,
        run: () => editor.chain().focus().setCallout('warning').run()
      },
      {
        id: 'info',
        label: 'Info callout',
        keywords: 'information tip',
        icon: Info,
        run: () => editor.chain().focus().setCallout('info').run()
      },
      {
        id: 'cover',
        label: 'Cover / header',
        keywords: 'metadata control',
        icon: FileText,
        run: () => insertHtml(editor, coverHeaderSnippet(snippetContext ?? {}))
      },
      {
        id: 'control',
        label: 'Document control',
        keywords: 'author reviewer',
        icon: ClipboardList,
        run: () => insertHtml(editor, documentControlSnippet())
      },
      {
        id: 'trace',
        label: 'Traceability table',
        keywords: 'req test design',
        icon: Hash,
        run: () => insertHtml(editor, traceabilitySnippet())
      },
      {
        id: 'approval',
        label: 'Approval table',
        keywords: 'signoff signature',
        icon: Scale,
        run: () => insertHtml(editor, approvalTableSnippet())
      },
      {
        id: 'pagebreak',
        label: 'Page break',
        keywords: 'print pdf',
        icon: SplitSquareHorizontal,
        run: () => editor.chain().focus().setPageBreak().run()
      },
      {
        id: 'toc',
        label: 'Table of contents',
        keywords: 'outline index',
        icon: ListTree,
        run: () => editor.chain().focus().insertTableOfContents().run()
      },
      {
        id: 'ai',
        label: 'AI generate',
        keywords: 'ai write continue /ai',
        icon: Sparkles,
        run: () =>
          onAskAI?.(
            'Generate the next logical section for this document. Use a professional requirement-writing tone. Add bullet points and acceptance criteria where appropriate.'
          )
      }
    ],
    [editor, onAskAI, snippetContext, projectId]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editor.isFocused) return
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        setQuery('')
        return
      }

      if (e.key !== '/') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Only open when slash is typed into regular text (avoid code blocks).
      if (editor.isActive('codeBlock')) return

      // Let the slash be inserted, then open the menu and position it at caret.
      setTimeout(() => {
        try {
          const caret = editor.state.selection.from
          const c = editor.view.coordsAtPos(caret)
          setPos({ top: Math.round(c.bottom + 8), left: Math.round(c.left) })
          setOpen(true)
          setQuery('')
        } catch {
          // ignore
        }
      }, 0)
    }

    editor.view.dom.addEventListener('keydown', onKeyDown)
    return () => editor.view.dom.removeEventListener('keydown', onKeyDown)
  }, [editor, open])

  const consumeSlash = () => {
    const { $from } = editor.state.selection
    const offset = $from.parentOffset
    const textBefore = $from.parent.textBetween(Math.max(0, offset - 1), offset)
    if (textBefore === '/') {
      editor.commands.deleteRange({ from: $from.pos - 1, to: $from.pos })
    }
  }

  const filtered = useMemo(() => {
    const raw = query.trim()
    const q = raw.toLowerCase()
    const aiPrompt = q.startsWith('ai ') ? raw.slice(3).trim() : q === 'ai' ? '' : null
    const base = !q
      ? (items ?? [])
      : (items ?? []).filter((it) => {
          const hay = `${it.label} ${it.keywords ?? ''}`.toLowerCase()
          return hay.includes(q) || (aiPrompt !== null && it.id === 'ai')
        })
    if (aiPrompt) {
      return [
        {
          id: 'ai-prompt',
          label: `AI: ${aiPrompt}`,
          keywords: 'generate write',
          icon: Sparkles,
          run: () => onAskAI?.(aiPrompt)
        },
        ...base
      ]
    }
    return base
  }, [items, onAskAI, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  if (!open) return null

  return createPortal(
    <div className="fixed z-[320]" style={{ top: pos.top, left: pos.left }}>
      <div
        className={cn(
          'w-[320px] overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl',
          'backdrop-blur supports-[backdrop-filter]:bg-card/80'
        )}
      >
        <Command
          value={query}
          onValueChange={setQuery}
          className="flex flex-col"
          filter={() => 1} // we filter ourselves to keep keywords simple and stable
        >
          <div className="border-b border-border/70 px-3 py-2">
            <Command.Input
              autoFocus
              placeholder="Type a command or ai …"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Tip: press Esc to close</p>
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">No commands found</div>
            )}
            {filtered.map((it) => {
              const Icon = it.icon
              return (
                <Command.Item
                  key={it.id}
                  onSelect={() => {
                    consumeSlash()
                    it.run()
                    close()
                  }}
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-xl px-2.5 py-2 text-sm outline-none',
                    'data-[selected=true]:bg-muted'
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{it.label}</div>
                    {it.keywords && <div className="truncate text-[11px] text-muted-foreground">{it.keywords}</div>}
                  </div>
                </Command.Item>
              )
            })}
          </Command.List>
        </Command>
      </div>

      {/* click outside */}
      <button
        type="button"
        className="fixed inset-0 -z-10 cursor-default"
        aria-label="Close"
        onMouseDown={(e) => {
          e.preventDefault()
          close()
        }}
      />
    </div>,
    document.body
  )
}

