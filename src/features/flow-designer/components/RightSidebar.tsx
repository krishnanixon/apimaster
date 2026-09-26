import { PropertiesPanel } from './PropertiesPanel'
import { AIPanel } from './AIPanel'
import { LayersPanel } from './LayersPanel'
import { ValidationPanel } from './ValidationPanel'
import { useFlowEditorStore } from '../stores/flow-editor.store'
import { cn } from '@/shared/lib/utils'
import { Settings2, ShieldCheck, Sparkles, Layers, PanelRightClose } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { PanelResizeHandle } from './PanelResizeHandle'
import type { FlowPanelLayout } from '@shared/types'

interface RightSidebarProps {
  flowId?: string
  onFlowGenerated?: (nodes: string, edges: string) => void
}

const TABS: {
  id: FlowPanelLayout['rightTab']
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'properties', label: 'Properties', icon: Settings2 },
  { id: 'validation', label: 'Validate', icon: ShieldCheck },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'layers', label: 'Layers', icon: Layers }
]

export function RightSidebar({ flowId, onFlowGenerated }: RightSidebarProps) {
  const { panelLayout, setPanelLayout } = useFlowEditorStore()
  const { rightCollapsed, rightWidth, rightTab } = panelLayout

  if (rightCollapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border/60 bg-sidebar py-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              rightTab === tab.id && 'bg-primary/10 text-primary'
            )}
            title={tab.label}
            onClick={() => setPanelLayout({ rightCollapsed: false, rightTab: tab.id })}
          >
            <tab.icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-border/60 bg-sidebar"
      style={{ width: rightWidth }}
    >
      <PanelResizeHandle
        side="right"
        onResize={(delta) =>
          setPanelLayout({ rightWidth: Math.min(480, Math.max(260, rightWidth + delta)) })
        }
      />
      <div className="flex items-center justify-between border-b border-border/40 px-1.5 pt-1.5">
        <div className="flex min-w-0 flex-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPanelLayout({ rightTab: tab.id })}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 border-b-2 px-1.5 py-2 text-[11px] font-medium transition-colors',
                rightTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-3 w-3 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="mb-1 h-8 w-8 shrink-0"
          onClick={() => setPanelLayout({ rightCollapsed: true })}
          title="Collapse panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-background">
        {rightTab === 'properties' && <PropertiesPanel />}
        {rightTab === 'validation' && <ValidationPanel />}
        {rightTab === 'ai' && <AIPanel flowId={flowId} onGenerated={onFlowGenerated} />}
        {rightTab === 'layers' && <LayersPanel />}
      </div>
    </div>
  )
}
