import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl+S', action: 'Save document' },
  { keys: 'Ctrl+F', action: 'Find next' },
  { keys: 'Ctrl+H', action: 'Find and replace' },
  { keys: 'Ctrl+K', action: 'Insert or edit link' },
  { keys: 'Ctrl+/', action: 'Keyboard shortcuts' },
  { keys: 'Ctrl+P', action: 'Print' },
  { keys: 'Ctrl+B / I / U', action: 'Bold, italic, underline' },
  { keys: 'Ctrl+Z / Y', action: 'Undo / redo' },
  { keys: 'Ctrl+Shift+V', action: 'Paste without formatting' },
  { keys: 'Ctrl+Alt+1–4', action: 'Heading 1–4' },
  { keys: 'Ctrl+Shift+7 / 8', action: 'Numbered / bullet list' },
  { keys: '/', action: 'Insert block (headings, REQ, TOC, /ai)' },
  { keys: '/ai …', action: 'AI generate from slash command' },
  { keys: 'Ctrl+Shift+P', action: 'Jump to next placeholder' },
  { keys: 'Esc', action: 'Close find bar or menus' }
]

export function EditorShortcutsDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editor shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {SHORTCUTS.map((item) => (
            <div key={item.keys} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{item.action}</span>
              <kbd className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
