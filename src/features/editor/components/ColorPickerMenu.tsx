import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { ToolbarPopover } from '@/features/editor/components/ToolbarPopover'
import { WordScreenTip } from '@/features/editor/components/WordScreenTip'

interface ColorOption {
  label: string
  value: string
}

interface ColorPickerMenuProps {
  label: string
  description?: string
  shortcut?: string
  icon: React.ReactNode
  colors: readonly ColorOption[]
  activeColor?: string
  onSelect: (color: string) => void
  showDefault?: boolean
}

export function ColorPickerMenu({
  label,
  description,
  shortcut,
  icon,
  colors,
  activeColor,
  onSelect,
  showDefault = true
}: ColorPickerMenuProps) {
  const [open, setOpen] = useState(false)
  const displayColors = showDefault ? (colors ?? []) : (colors ?? []).filter((c) => c.value)

  return (
    <ToolbarPopover
      open={open}
      onOpenChange={setOpen}
      className="w-44"
      trigger={
        <WordScreenTip label={label} shortcut={shortcut} description={description} disabled={open}>
          <button
            type="button"
            aria-label={label}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={cn(
              'flex h-8 items-center gap-0.5 rounded-md px-1.5 text-sm transition-colors hover:bg-muted',
              open && 'bg-muted'
            )}
          >
            {icon}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </WordScreenTip>
      }
    >
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {displayColors.map((c) => (
          <WordScreenTip
            key={c.label}
            label={c.label}
            description={c.value ? `Apply ${c.label.toLowerCase()} to the selection.` : 'Clear the current color.'}
            delayDuration={200}
          >
            <button
              type="button"
              aria-label={c.label}
              onClick={() => {
                onSelect(c.value)
                setOpen(false)
              }}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md border transition-transform hover:scale-110',
                activeColor === c.value && 'ring-2 ring-primary ring-offset-1',
                !c.value && 'border-dashed text-[9px] text-muted-foreground'
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
            >
              {!c.value ? 'A' : null}
            </button>
          </WordScreenTip>
        ))}
      </div>
    </ToolbarPopover>
  )
}
