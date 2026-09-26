import { useEffect, useMemo, useState } from 'react'
import { Bookmark, ClipboardPaste, FilePlus, Loader2, Sparkles, SquarePen } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import {
  DOCUMENT_TEMPLATES,
  buildDocumentHtml,
  buildDocumentCreationPrompt,
  getTemplateMeta
} from '@/features/documents/templates/document-templates'
import {
  loadSavedTemplates,
  type SavedTemplate
} from '@/features/documents/templates/saved-templates'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { DOCUMENT_TYPE_LABELS, cn } from '@/shared/lib/utils'
import type { DocumentStyle, DocumentType } from '@shared/types'
import { pastedTextToDocumentHtml } from '@shared/lib/document-paste'

type CreateMode = 'blank' | 'paste' | 'template' | 'ai' | 'saved'

interface CreateDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  projectDescription?: string
  projectStyle?: DocumentStyle
  initialType?: DocumentType
  initialSavedTemplateId?: string
  onCreate: (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    htmlContent: string
  }) => Promise<{ success: boolean; error?: string }>
  onGenerate?: (input: {
    title: string
    type: DocumentType
    style: DocumentStyle
    prompt: string
  }) => Promise<{ success: boolean; error?: string }>
  creating?: boolean
}

const STYLES: DocumentStyle[] = ['chatgpt', 'professional', 'enterprise', 'basic']

export function CreateDocumentDialog({
  open,
  onOpenChange,
  projectName,
  projectDescription = '',
  projectStyle = 'professional',
  initialType,
  initialSavedTemplateId,
  onCreate,
  onGenerate,
  creating = false
}: CreateDocumentDialogProps) {
  const { apiKeyStatus } = useSettingsStore()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [pastedContent, setPastedContent] = useState('')
  const [type, setType] = useState<DocumentType>(initialType ?? 'requirements')
  const [style, setStyle] = useState<DocumentStyle>(projectStyle)
  const [mode, setMode] = useState<CreateMode>('blank')
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [selectedSavedId, setSelectedSavedId] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const resetForm = () => {
    setTitle('')
    setNotes('')
    setPastedContent('')
    setType('requirements')
    setStyle(projectStyle)
    setMode('blank')
    setSelectedSavedId('')
    setSubmitError(null)
  }

  useEffect(() => {
    if (!open) {
      resetForm()
      return
    }
    const templates = loadSavedTemplates()
    setSavedTemplates(templates)
    if (initialSavedTemplateId) {
      const found = templates.find((t) => t.id === initialSavedTemplateId)
      if (found) {
        setMode('saved')
        setSelectedSavedId(found.id)
        setType(found.type)
        setStyle(found.style)
        setTitle(found.name)
        return
      }
    }
    if (initialType) setType(initialType)
  }, [open, initialType, initialSavedTemplateId, projectStyle])

  const selectedSaved = useMemo(
    () => savedTemplates.find((t) => t.id === selectedSavedId) ?? null,
    [savedTemplates, selectedSavedId]
  )

  const docTitle =
    title.trim() || (mode === 'blank' ? 'Untitled Document' : getTemplateMeta(type).label)
  const docType = selectedSaved && mode === 'saved' ? selectedSaved.type : type
  const docStyle = selectedSaved && mode === 'saved' ? selectedSaved.style : style

  const createBlank = async () => {
    setSubmitError(null)
    const result = await onCreate({
      title: title.trim() || 'Untitled Document',
      type,
      style: docStyle,
      htmlContent: ''
    })
    if (!result.success) {
      setSubmitError(result.error ?? 'Could not create a blank document.')
    }
  }

  const handleSubmit = async () => {
    setSubmitError(null)
    try {
      if (mode === 'ai' && onGenerate && apiKeyStatus?.isSet) {
        const result = await onGenerate({
          title: docTitle,
          type: docType,
          style: docStyle,
          prompt: buildDocumentCreationPrompt({
            projectName,
            projectDescription,
            documentTitle: docTitle,
            documentDescription: notes,
            type: docType,
            style: docStyle
          })
        })
        if (!result.success) {
          setSubmitError(result.error ?? 'Generation failed. Check your API key in Settings.')
        }
        return
      }

      const html =
        mode === 'paste'
          ? pastedTextToDocumentHtml(pastedContent)
          : mode === 'saved' && selectedSaved
            ? selectedSaved.htmlContent
            : mode === 'template'
              ? buildDocumentHtml(type, docTitle, projectName, style, notes)
              : ''

      const result = await onCreate({
        title: docTitle,
        type: docType,
        style: docStyle,
        htmlContent: html
      })
      if (!result.success) {
        setSubmitError(result.error ?? 'Could not create the document.')
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  const modes: { id: CreateMode; label: string; icon: typeof SquarePen; hidden?: boolean }[] = [
    { id: 'blank', label: 'Blank', icon: SquarePen },
    { id: 'paste', label: 'Paste', icon: ClipboardPaste },
    { id: 'template', label: 'Template', icon: FilePlus },
    { id: 'ai', label: 'AI', icon: Sparkles, hidden: !onGenerate },
    {
      id: 'saved',
      label: 'Saved',
      icon: Bookmark,
      hidden: savedTemplates.length === 0 && mode !== 'saved'
    }
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (creating) return
        if (!next) resetForm()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0 sm:rounded-xl">
        <DialogHeader className="space-y-1 px-4 pb-2 pt-4 text-left">
          <DialogTitle className="text-sm">New document</DialogTitle>
          <DialogDescription className="text-xs">
            Generate, paste, or start from a reusable template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 pb-4">
          <div className="flex rounded-md border border-border p-0.5">
            {modes
              .filter((item) => !item.hidden)
              .map((item) => {
                const Icon = item.icon
                const disabled = item.id === 'ai' && !apiKeyStatus?.isSet
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled || creating}
                    onClick={() => setMode(item.id)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[11px] font-medium',
                      mode === item.id && 'bg-primary text-primary-foreground',
                      disabled && 'opacity-40'
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {item.label}
                  </button>
                )
              })}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium">Title</label>
            <Input
              placeholder="Untitled Document"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={creating}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DocumentType)}
                disabled={creating || mode === 'saved'}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
              >
                {DOCUMENT_TEMPLATES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium">Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as DocumentStyle)}
                disabled={creating || mode === 'saved'}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs capitalize outline-none"
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {mode === 'saved' && (
            <select
              value={selectedSavedId}
              onChange={(e) => {
                const next = savedTemplates.find((t) => t.id === e.target.value)
                setSelectedSavedId(e.target.value)
                if (next && !title) setTitle(next.name)
              }}
              disabled={creating}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none"
            >
              <option value="">Choose a saved template</option>
              {savedTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {(mode === 'template' || mode === 'ai') && (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === 'ai' ? 'Optional focus for AI…' : 'Optional notes for the template…'
              }
              className="min-h-[64px] text-xs"
              disabled={creating}
            />
          )}

          {mode === 'paste' && (
            <div className="space-y-1.5">
              <Textarea
                value={pastedContent}
                onChange={(e) => setPastedContent(e.target.value)}
                placeholder={
                  'Paste notes or Markdown here…\n\n# Heading\n- Key point\n/split\n## Next card'
                }
                className="min-h-[150px] text-xs"
                disabled={creating}
              />
              <p className="text-[10px] text-muted-foreground">
                Headings become card sections. Use <code>/split</code> or <code>---</code> for an
                explicit page break.
              </p>
            </div>
          )}

          {mode === 'ai' && !apiKeyStatus?.isSet && (
            <p className="text-[11px] text-amber-600">Set an API key in Settings to use AI.</p>
          )}

          {submitError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={creating}
            onClick={() => void createBlank()}
          >
            Skip — blank document
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={creating}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={() => void handleSubmit()}
              disabled={
                creating ||
                (mode === 'saved' && !selectedSaved) ||
                (mode === 'paste' && !pastedContent.trim()) ||
                (mode === 'ai' && !apiKeyStatus?.isSet)
              }
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : mode === 'ai' ? (
                <Sparkles className="h-3.5 w-3.5" />
              ) : (
                <FilePlus className="h-3.5 w-3.5" />
              )}
              {creating
                ? mode === 'ai'
                  ? 'Generating…'
                  : 'Creating…'
                : mode === 'ai'
                  ? 'Generate'
                  : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DOCUMENT_TYPE_LABELS }
