import { FileImage, LayoutTemplate, Sparkles, Type } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

interface CanvasQuickActionsProps {
  onAddText: () => void
  onAddImage: () => void
  onPickLayout: () => void
  onDesignWithAI: () => void
}

export function CanvasQuickActions({
  onAddText,
  onAddImage,
  onPickLayout,
  onDesignWithAI
}: CanvasQuickActionsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm rounded-xl border border-border/70 bg-card p-5 text-center shadow-md">
        <p className="text-sm font-semibold">Start designing this slide</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Add content, pick a layout, or generate with AI
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <QuickAction icon={Type} label="Add text" onClick={onAddText} />
          <QuickAction icon={FileImage} label="Add image" onClick={onAddImage} />
          <QuickAction icon={LayoutTemplate} label="Use layout" onClick={onPickLayout} />
          <QuickAction icon={Sparkles} label="Design with AI" onClick={onDesignWithAI} primary />
        </div>
      </div>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  primary
}: {
  icon: typeof Type
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <Button
      type="button"
      variant={primary ? 'default' : 'outline'}
      size="sm"
      className="h-auto flex-col gap-1.5 rounded-lg py-3 text-[11px]"
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  )
}
