import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import { DocumentLengthControl } from '@/features/documents/components/DocumentLengthControl'
import {
  DEFAULT_DOCUMENT_LENGTH,
  getLengthPreset
} from '@/features/documents/lib/generation-options'
import { buildDocumentCreationPrompt } from '@/features/documents/templates/document-templates'
import type { DocumentLength, DocumentStyle, DocumentType } from '@shared/types'

const TYPES: DocumentType[] = [
  'discovery',
  'brd',
  'prd',
  'scope',
  'requirements',
  'functional',
  'non_functional',
  'product_definition',
  'user_stories',
  'ui_ux',
  'api_spec',
  'database_schema',
  'architecture',
  'system_design',
  'technical_design',
  'timeline',
  'risks',
  'testing',
  'uat',
  'deployment',
  'release_notes',
  'user_guide',
  'handover',
  'change_request',
  'contract',
  'proposal',
  'estimation_report'
]

const STYLES: { value: DocumentStyle; label: string }[] = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'professional', label: 'Professional' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'basic', label: 'Basic' }
]

interface QuickGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  projectDescription?: string
  projectStyle?: DocumentStyle
  generating?: boolean
  onGenerate: (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    prompt: string
    documentLength: DocumentLength
    customWordCount?: number
    wordTarget: number
    maxTokens: number
  }) => Promise<void>
}

export function QuickGenerateDialog({
  open,
  onOpenChange,
  projectName,
  projectDescription = '',
  projectStyle = 'professional',
  generating = false,
  onGenerate
}: QuickGenerateDialogProps) {
  const [type, setType] = useState<DocumentType>('requirements')
  const [style, setStyle] = useState<DocumentStyle>(projectStyle)
  const [length, setLength] = useState<DocumentLength>(DEFAULT_DOCUMENT_LENGTH)
  const [customWordCount, setCustomWordCount] = useState(7500)
  const [notes, setNotes] = useState('')

  const handleGenerate = async () => {
    const preset = getLengthPreset(length, customWordCount)
    const title = `${DOCUMENT_TYPE_LABELS[type]} — ${projectName}`
    const prompt = buildDocumentCreationPrompt({
      projectName,
      projectDescription,
      documentTitle: title,
      documentDescription: projectDescription,
      type,
      style,
      additionalNotes: notes.trim() || undefined,
      documentLength: length,
      wordTarget: preset.wordTarget
    })
    await onGenerate({
      title,
      type,
      style,
      prompt,
      documentLength: length,
      customWordCount: length === 'custom' ? customWordCount : undefined,
      wordTarget: preset.wordTarget,
      maxTokens: preset.maxTokens
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Quick generate</DialogTitle>
          <DialogDescription className="text-xs">
            Skip the wizard and generate from current project knowledge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Type</p>
            <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto">
              {TYPES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
                    type === item
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  {DOCUMENT_TYPE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Style</p>
            <div className="flex flex-wrap gap-1">
              {STYLES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStyle(item.value)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-[11px]',
                    style === item.value
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <DocumentLengthControl
            length={length}
            customWordCount={customWordCount}
            onLengthChange={setLength}
            onCustomWordCountChange={setCustomWordCount}
          />

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional focus: modules, audience, constraints…"
            className="min-h-[72px] text-xs"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8" disabled={generating} onClick={() => void handleGenerate()}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
