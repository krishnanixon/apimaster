import { useId } from 'react'
import { Switch } from '@/shared/components/ui/switch'
import { cn } from '@/shared/lib/utils'

/** Switch row — the whole row is clickable. Designed to sit inside a flush SettingsGroup. */
export function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  className
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-5 py-3.5 transition-colors',
        !disabled && 'cursor-pointer hover:bg-accent/30',
        className
      )}
      onClick={(e) => {
        if (disabled || (e.target as HTMLElement).closest('button')) return
        onChange(!checked)
      }}
    >
      <div className="min-w-0 flex-1">
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        aria-labelledby={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
