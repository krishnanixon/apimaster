import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Check, Circle, FileUp, Loader2, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  IMPORT_FILE_ACCEPT,
  readImportedFile,
  type ImportProgress,
  type ImportProgressStep,
  type ImportedSource
} from '@/features/documents/lib/read-import-file'
import { toast } from 'sonner'

export type ImportUiStepStatus = 'pending' | 'active' | 'done' | 'error'

export interface ImportUiStep {
  id: ImportProgressStep
  label: string
  status: ImportUiStepStatus
  detail?: string
}

const BASE_STEPS: Array<{ id: ImportProgressStep; label: string }> = [
  { id: 'reading', label: 'Reading file' },
  { id: 'converting', label: 'Converting content' },
  { id: 'preparing', label: 'Preparing document' },
  { id: 'done', label: 'Ready' }
]

function stepsForKind(kind: ImportProgress['kind']): Array<{ id: ImportProgressStep; label: string }> {
  if (kind === 'pdf') {
    return [
      { id: 'reading', label: 'Reading PDF' },
      { id: 'converting', label: 'Converting PDF to text' },
      { id: 'preparing', label: 'Building document' },
      { id: 'done', label: 'Ready' }
    ]
  }
  if (kind === 'word') {
    return [
      { id: 'reading', label: 'Reading Word file' },
      { id: 'converting', label: 'Converting Word to text' },
      { id: 'preparing', label: 'Building document' },
      { id: 'done', label: 'Ready' }
    ]
  }
  return BASE_STEPS
}

function applyProgress(prev: ImportUiStep[], progress: ImportProgress): ImportUiStep[] {
  const template = stepsForKind(progress.kind)
  const order = template.map((s) => s.id)
  const activeIdx = order.indexOf(progress.step)
  return template.map((step, idx) => {
    if (progress.step === 'done' && step.id === 'done') {
      return { ...step, status: 'done' as const, detail: progress.detail ?? progress.label }
    }
    if (idx < activeIdx) return { ...step, status: 'done' as const, detail: undefined }
    if (idx === activeIdx) {
      return {
        ...step,
        status: progress.step === 'done' ? ('done' as const) : ('active' as const),
        detail: progress.detail ?? progress.label
      }
    }
    return { ...step, status: 'pending' as const, detail: undefined }
  })
}

interface WordFileDropZoneProps {
  onImported: (source: ImportedSource) => void | Promise<void>
  disabled?: boolean
  compact?: boolean
  multiple?: boolean
  description?: string
  children?: ReactNode
  /** Called after parse succeeds and before/while onImported runs (e.g. saving). */
  onSavingLabel?: string
}

export function WordFileDropZone({
  onImported,
  disabled = false,
  compact = false,
  multiple = false,
  description = 'Drop a PDF or Word (.docx) file here, or click to browse. Markdown, HTML, and text also work.',
  children,
  onSavingLabel = 'Saving document…'
}: WordFileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<ImportUiStep[] | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      setBusy(true)
      setErrorDetail(null)
      try {
        const selected = multiple ? list : list.slice(0, 1)
        for (const file of selected) {
          setActiveFile(file.name)
          setSteps(
            stepsForKind(
              file.name.toLowerCase().endsWith('.pdf')
                ? 'pdf'
                : file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.docm')
                  ? 'word'
                  : 'text'
            ).map((s, i) => ({
              ...s,
              status: i === 0 ? 'active' : 'pending'
            }))
          )

          const source = await readImportedFile(file, (progress) => {
            setSteps((prev) => applyProgress(prev ?? stepsForKind(progress.kind), progress))
          })

          setSteps((prev) => {
            const base = prev ?? stepsForKind(source.kind)
            return base.map((s) =>
              s.id === 'done'
                ? { ...s, status: 'active' as const, detail: onSavingLabel }
                : { ...s, status: 'done' as const }
            )
          })

          await onImported(source)

          setSteps((prev) =>
            (prev ?? stepsForKind(source.kind)).map((s) => ({
              ...s,
              status: 'done' as const,
              detail: s.id === 'done' ? 'Imported' : s.detail
            }))
          )
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not import file'
        setErrorDetail(message)
        setSteps((prev) =>
          (prev ?? BASE_STEPS.map((s) => ({ ...s, status: 'pending' as const }))).map((s) =>
            s.status === 'active' ? { ...s, status: 'error' as const, detail: message } : s
          )
        )
        toast.error(message)
      } finally {
        setBusy(false)
        if (inputRef.current) inputRef.current.value = ''
        window.setTimeout(() => {
          setSteps(null)
          setActiveFile(null)
          setErrorDetail(null)
        }, 1600)
      }
    },
    [multiple, onImported, onSavingLabel]
  )

  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled || busy) return
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'rounded-lg border border-dashed px-3 py-3 transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20',
        disabled && 'pointer-events-none opacity-60',
        compact && 'py-2'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_FILE_ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files)
        }}
      />
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : (
          <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span>
          <span className="block text-xs font-medium">
            {busy
              ? activeFile
                ? `Importing ${activeFile}…`
                : 'Importing…'
              : 'Import PDF, Word, or text file'}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{description}</span>
        </span>
      </button>

      {steps && (
        <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 shrink-0">
                {step.status === 'done' ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : step.status === 'error' ? (
                  <X className="h-3 w-3 text-destructive" />
                ) : step.status === 'active' ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground/40" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block font-medium',
                    step.status === 'error' && 'text-destructive',
                    step.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
                {(step.detail || (step.status === 'error' && errorDetail)) && (
                  <span className="block truncate text-muted-foreground">
                    {step.status === 'error' ? errorDetail : step.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {children}
    </div>
  )
}
