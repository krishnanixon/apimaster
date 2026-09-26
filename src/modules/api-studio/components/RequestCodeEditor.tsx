import { useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { Wand2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { useApiStudioEditorTheme } from '../theme/editorTheme'
import { useLanguageExtension } from './useLanguageExtension'

interface RequestCodeEditorProps {
  value: string
  onChange?: (value: string) => void
  /** Synthetic filename for syntax highlighting, e.g. `body.json` or `tests.js`. */
  languageFile?: string | null
  placeholder?: string
  className?: string
  /** Used only as a fallback before the first ResizeObserver measurement. */
  minHeight?: string
  readOnly?: boolean
  label?: string
  showFormat?: boolean
  /** Show copy button in the editor toolbar. Defaults to true. */
  showCopy?: boolean
  /** Extra CodeMirror extensions. Used by the GraphQL editor without changing JSON/text editors. */
  extraExtensions?: Extension[]
  /** Custom formatter. Return null when the text cannot be formatted. */
  formatText?: (value: string) => string | null
  formatTitle?: string
  autocomplete?: boolean
}

function formatJson(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return value
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return null
  }
}

/** CodeMirror pane themed to match API Studio / app design tokens. */
export function RequestCodeEditor({
  value,
  onChange,
  languageFile = null,
  placeholder,
  className,
  minHeight = '120px',
  readOnly = false,
  label,
  showFormat = false,
  showCopy = true,
  extraExtensions,
  formatText,
  formatTitle = 'Format',
  autocomplete = false
}: RequestCodeEditorProps) {
  const theme = useApiStudioEditorTheme()
  const asyncLang = useLanguageExtension(languageFile)
  const isJson = languageFile?.endsWith('.json') ?? false
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const formatTextRef = useRef(formatText)
  onChangeRef.current = onChange
  formatTextRef.current = formatText

  const [editorHeight, setEditorHeight] = useState(0)

  useEffect(() => {
    const el = editorAreaRef.current
    if (!el) return

    const updateSize = () => {
      const height = Math.floor(el.getBoundingClientRect().height)
      if (height > 0) setEditorHeight(height)
    }

    updateSize()
    const raf1 = requestAnimationFrame(updateSize)
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(updateSize))
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      observer.disconnect()
    }
  }, [])

  function applyFormat(current: string): boolean {
    const change = onChangeRef.current
    if (!change) return false
    const formatter = formatTextRef.current
    const formatted = formatter ? formatter(current) : formatJson(current)
    if (formatted === null) {
      toast.error(formatter ? 'Could not format' : 'Invalid JSON — cannot format')
      return false
    }
    if (formatted !== current) change(formatted)
    toast.success(formatter ? 'Formatted' : 'JSON formatted')
    return true
  }

  async function handleCopy() {
    if (!value) {
      toast.error('Nothing to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  const extensions = useMemo(() => {
    const list: Extension[] = [
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({
        'aria-label': label ?? (isJson ? 'JSON body' : 'Request body'),
        spellcheck: 'false'
      }),
      EditorView.theme({
        '&': { height: '100%', width: '100%' },
        '.cm-scroller': { overflow: 'auto', minHeight: '100%' },
        '.cm-content': {
          color: 'hsl(var(--foreground))',
          caretColor: 'hsl(var(--primary))',
          minHeight: '100%',
          fontFamily:
            "ui-monospace, 'JetBrains Mono', 'Fira Code', SFMono-Regular, Menlo, Consolas, monospace"
        },
        '.cm-placeholder': {
          color: 'hsl(var(--muted-foreground))',
          fontStyle: 'italic'
        },
        '&.cm-focused': { outline: 'none' }
      })
    ]

    if (placeholder) list.push(placeholderExt(placeholder))
    if (isJson) list.push(json())
    else if (asyncLang) list.push(asyncLang)
    if (extraExtensions?.length) list.push(...extraExtensions)

    const canFormat = showFormat && !readOnly && (isJson || Boolean(formatTextRef.current))
    if (canFormat) {
      list.push(
        keymap.of([
          {
            key: 'Shift-Alt-f',
            run: (view) => {
              applyFormat(view.state.doc.toString())
              return true
            }
          },
          {
            key: 'Mod-Shift-f',
            run: (view) => {
              applyFormat(view.state.doc.toString())
              return true
            }
          }
        ])
      )
    }
    return list
  }, [asyncLang, extraExtensions, isJson, label, placeholder, readOnly, showFormat])

  const displayLabel = label ?? (isJson ? 'JSON' : languageFile?.replace(/^.*\./, '').toUpperCase())
  const resolvedHeight = editorHeight > 0 ? editorHeight : Number.parseInt(minHeight, 10) || 120

  return (
    <div
      className={cn(
        'api-studio-editor flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/30',
        className
      )}
    >
      {displayLabel && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {displayLabel}
          </span>
          <div className="flex items-center gap-0.5">
            {showCopy && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void handleCopy()}
                title="Copy"
                disabled={!value}
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
            )}
            {showFormat && !readOnly && onChange && (isJson || formatText) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => applyFormat(value)}
                title={formatTitle}
              >
                <Wand2 className="h-3 w-3" />
                Format
              </Button>
            )}
          </div>
        </div>
      )}

      <div ref={editorAreaRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <CodeMirror
            value={value}
            height={`${resolvedHeight}px`}
            width="100%"
            theme={theme}
            extensions={extensions}
            onChange={readOnly ? undefined : onChange}
            basicSetup={{
              lineNumbers: true,
              foldGutter: isJson || Boolean(extraExtensions?.length),
              highlightActiveLine: !readOnly,
              highlightActiveLineGutter: !readOnly,
              indentOnInput: !readOnly,
              bracketMatching: true,
              closeBrackets: !readOnly,
              autocompletion: autocomplete,
              searchKeymap: false
            }}
            style={{
              height: `${resolvedHeight}px`,
              width: '100%',
              fontSize: '13px',
              lineHeight: '1.55'
            }}
            className="h-full w-full max-w-full"
          />
        </div>
      </div>
    </div>
  )
}
