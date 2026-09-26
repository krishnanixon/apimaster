import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/shared/lib/utils'

const COLLAPSED_COMPACT = 28
const COLLAPSED_DEFAULT = 32
const EXPANDED_MIN_COMPACT = 40
const EXPANDED_MIN_DEFAULT = 44
const EXPANDED_MAX = 64

interface ExpandableFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
  disabled?: boolean
  compact?: boolean
  mono?: boolean
  /** Borderless, for embedding in a combined control like the URL bar. */
  bare?: boolean
  'aria-label'?: string
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
  onBlur?: () => void
}

/** Single-line field that becomes a wrapping textarea on focus so long values stay readable. */
export function ExpandableField({
  value,
  onChange,
  placeholder,
  className,
  readOnly,
  disabled,
  compact = false,
  mono = false,
  bare = false,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
  ...rest
}: ExpandableFieldProps) {
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const expanded = focused

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!expanded) {
      el.style.height = `${compact ? COLLAPSED_COMPACT : COLLAPSED_DEFAULT}px`
      return
    }
    el.style.height = 'auto'
    const min = compact ? EXPANDED_MIN_COMPACT : EXPANDED_MIN_DEFAULT
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), EXPANDED_MAX)}px`
  }, [value, expanded, compact])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      onFocus={() => {
        setFocused(true)
        onFocus?.()
      }}
      onBlur={() => {
        setFocused(false)
        onBlur?.()
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={cn(
        'w-full text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        bare
          ? 'border-0 bg-transparent px-2.5 shadow-none focus-visible:ring-0'
          : 'rounded-lg border border-input bg-background px-2.5 shadow-soft transition-[border-color,box-shadow] focus-visible:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/15',
        compact && !bare && 'rounded-md px-2 text-xs',
        compact && bare && 'px-2.5 text-xs',
        mono && 'font-mono',
        expanded
          ? 'resize-y overflow-auto whitespace-pre-wrap break-all py-1.5'
          : 'resize-none overflow-x-auto overflow-y-hidden whitespace-nowrap py-1 leading-5',
        className
      )}
      {...rest}
    />
  )
}
