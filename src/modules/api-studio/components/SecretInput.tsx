import { useState } from 'react'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { ExpandableField } from './ExpandableField'

interface SecretInputProps {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  readOnly?: boolean
  /** When false, starts visible (useful for non-password secrets the user may want open). Default true. */
  startHidden?: boolean
}

/** Password/token field with show/hide, copy, and click-to-expand when visible. */
export function SecretInput({
  className,
  value,
  onChange,
  placeholder,
  startHidden = true,
  disabled,
  readOnly
}: SecretInputProps) {
  const [visible, setVisible] = useState(!startHidden)
  const text = value ?? ''

  async function handleCopy() {
    if (!text) {
      toast.error('Nothing to copy')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <div className="relative">
      {visible ? (
        <ExpandableField
          value={text}
          onChange={(next) => onChange?.(next)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          compact
          mono
          className={cn('pr-16', className)}
        />
      ) : (
        <Input
          type="password"
          value={text}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          className={cn('h-8 pr-16 font-mono text-xs', className)}
        />
      )}
      <div className="absolute right-0.5 top-0.5 flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          title={visible ? 'Hide' : 'Show'}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => void handleCopy()}
          title="Copy"
          tabIndex={-1}
          disabled={!text}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
