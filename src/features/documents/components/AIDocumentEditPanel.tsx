import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  Wand2,
  ListPlus,
  Shield,
  Zap,
  FileCheck,
  Loader2,
  ListTree,
  Hash,
  Search,
  FileText,
  GitCompareArrows,
  BookOpen,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { extractOutline } from '@/features/editor/components/DocumentOutline'
import { cn } from '@/shared/lib/utils'

interface AIAction {
  icon: LucideIcon
  label: string
  short: string
  instruction: string
}

const DOCUMENT_ACTIONS: AIAction[] = [
  {
    icon: Search,
    label: 'Analyze document',
    short: 'Analyze',
    instruction:
      'Analyze this document. Identify strengths, gaps, ambiguous requirements, and recommended next edits. Return the analysis as a new section titled Document analysis at the end, without rewriting existing sections.'
  },
  {
    icon: GitCompareArrows,
    label: 'Find contradictions',
    short: 'Conflicts',
    instruction:
      'Find contradictions, overlapping requirements, and inconsistent terminology. Add an Issues found section listing each issue with the conflicting statements. Do not rewrite the rest of the document.'
  },
  {
    icon: ListPlus,
    label: 'Find missing requirements',
    short: 'Gaps',
    instruction:
      'Identify missing functional and non-functional requirements based on the current document. Add a Missing requirements section with numbered REQ items. Do not delete existing content.'
  },
  {
    icon: FileText,
    label: 'Executive summary',
    short: 'Summary',
    instruction:
      'Write a concise executive summary for this document and place it at the top after the title. Do not remove existing sections.'
  },
  {
    icon: ListTree,
    label: 'Generate TOC headings',
    short: 'TOC',
    instruction:
      'Ensure the document has a clear heading hierarchy for a table of contents. Add missing H2/H3 headings where sections are implied but not titled. Do not invent unrelated content.'
  },
  {
    icon: BookOpen,
    label: 'Generate user stories',
    short: 'Stories',
    instruction:
      'Generate user stories with Given/When/Then acceptance criteria from the existing requirements. Add them in a User stories section without removing current content.'
  },
  {
    icon: FileCheck,
    label: 'Generate test cases',
    short: 'Tests',
    instruction:
      'Generate test cases traced to requirement IDs. Add a Test cases section with ID, precondition, steps, and expected result.'
  }
]

const QUICK_ACTIONS: AIAction[] = [
  {
    icon: Wand2,
    label: 'Improve clarity',
    short: 'Clarity',
    instruction:
      'Improve clarity and professional tone throughout the document. Fix grammar and make requirements more precise.'
  },
  {
    icon: ListPlus,
    label: 'Expand sections',
    short: 'Expand',
    instruction:
      'Expand each section with more detailed requirements, examples, and acceptance criteria.'
  },
  {
    icon: Shield,
    label: 'Add NFRs',
    short: 'NFRs',
    instruction:
      'Add a comprehensive non-functional requirements section covering performance, security, and scalability.'
  },
  {
    icon: Zap,
    label: 'Simplify',
    short: 'Simplify',
    instruction:
      'Simplify the language and shorten verbose sections while keeping all key requirements.'
  },
  {
    icon: FileCheck,
    label: 'Add acceptance criteria',
    short: 'Criteria',
    instruction:
      'Add clear acceptance criteria to each functional requirement using Given/When/Then format where appropriate.'
  },
  {
    icon: ListPlus,
    label: 'Fill placeholders',
    short: 'Fill TBD',
    instruction:
      'Replace TBD, TODO, FIXME, and bracket placeholders like [Author] with realistic, professional draft content. Keep existing structure.'
  },
  {
    icon: Hash,
    label: 'Add requirement IDs',
    short: 'REQ IDs',
    instruction:
      'Assign sequential REQ-001 style IDs to requirements that do not already have IDs. Do not renumber existing IDs.'
  }
]

interface AIDocumentEditPanelProps {
  onApply: (instruction: string, sectionTitle?: string) => Promise<void>
  isProcessing?: boolean
  instruction?: string
  onInstructionChange?: (value: string) => void
  placeholder?: string
  className?: string
  /** Current document HTML — used to detect sections for scoped (section-only) editing. */
  htmlContent?: string
}

const WHOLE_DOCUMENT = '__whole_document__'

export function AIDocumentEditPanel({
  onApply,
  isProcessing = false,
  instruction: controlledInstruction,
  onInstructionChange,
  placeholder = 'Describe the change… e.g. add a risk section',
  className,
  htmlContent = ''
}: AIDocumentEditPanelProps) {
  const isControlled = typeof controlledInstruction === 'string'
  const [uncontrolled, setUncontrolled] = useState('')
  const instruction = useMemo(
    () => (isControlled ? controlledInstruction : uncontrolled),
    [controlledInstruction, isControlled, uncontrolled]
  )
  const [scope, setScope] = useState<string>(WHOLE_DOCUMENT)

  const sections = useMemo(
    () => extractOutline(htmlContent ?? '').filter((item) => item.level <= 2),
    [htmlContent]
  )

  useEffect(() => {
    if (isControlled) return
    setUncontrolled((v) => v)
  }, [isControlled])

  useEffect(() => {
    if (scope !== WHOLE_DOCUMENT && !sections.some((s) => s.text === scope)) {
      setScope(WHOLE_DOCUMENT)
    }
  }, [sections, scope])

  const setInstruction = (value: string) => {
    if (isControlled) onInstructionChange?.(value)
    else setUncontrolled(value)
  }

  const handleApply = async (text?: string) => {
    const cmd = (text ?? instruction).trim()
    if (!cmd || isProcessing) return
    const sectionTitle = scope === WHOLE_DOCUMENT ? undefined : scope
    await onApply(cmd, sectionTitle)
    if (!text) setInstruction('')
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none">AI edit</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Type a change or pick a shortcut</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Textarea
          placeholder={placeholder}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          className="resize-none text-xs"
          disabled={isProcessing}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void handleApply()
            }
          }}
        />
        <Button
          className="w-full"
          size="sm"
          disabled={!instruction.trim() || isProcessing}
          onClick={() => void handleApply()}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Applying…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {scope === WHOLE_DOCUMENT ? 'Apply' : 'Apply to section'}
            </>
          )}
        </Button>
      </div>

      {sections.length > 0 && (
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Scope
          </span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={isProcessing}
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[11px]"
          >
            <option value={WHOLE_DOCUMENT}>Whole document</option>
            {sections.map((s) => (
              <option key={s.id} value={s.text}>
                {'—'.repeat(Math.max(0, s.level - 1))} {s.text}
              </option>
            ))}
          </select>
        </label>
      )}

      <ActionGroup
        title="Edit"
        actions={QUICK_ACTIONS}
        disabled={isProcessing}
        onPick={(cmd) => void handleApply(cmd)}
      />
      <ActionGroup
        title="Analyze"
        actions={DOCUMENT_ACTIONS}
        disabled={isProcessing}
        onPick={(cmd) => void handleApply(cmd)}
      />
    </div>
  )
}

function ActionGroup({
  title,
  actions,
  disabled,
  onPick
}: {
  title: string
  actions: AIAction[]
  disabled: boolean
  onPick: (instruction: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1">
        {actions.map(({ icon: Icon, label, short, instruction }) => (
          <button
            key={label}
            type="button"
            title={label}
            disabled={disabled}
            onClick={() => onPick(instruction)}
            className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background px-1.5 py-1 text-[11px] leading-none text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Icon className="h-3 w-3 shrink-0 text-primary" />
            {short}
          </button>
        ))}
      </div>
    </div>
  )
}
