import { useState } from 'react'
import {
  BookMarked,
  FilePlus,
  GitBranch,
  Loader2,
  Presentation,
  Sparkles
} from 'lucide-react'
import type { FlowCategory, PresentationThemeId } from '@shared/types'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/components/ui/dropdown-menu'
import { toast } from 'sonner'

export type GeneratedArtifactKind = 'document' | 'presentation' | 'flow' | 'knowledge'

export interface GeneratedArtifact {
  id: string
  kind: GeneratedArtifactKind
  title: string
  description: string
  href?: string
}

interface ChatAssistantActionsProps {
  content: string
  projectId?: string
  disabled?: boolean
  compact?: boolean
  onCreated?: (artifact: GeneratedArtifact) => void
}

const ACTIONS: Array<{
  kind: GeneratedArtifactKind
  label: string
  description: string
  icon: typeof FilePlus
}> = [
  {
    kind: 'document',
    label: 'Generate document',
    description: 'Turn this answer into a polished project document',
    icon: FilePlus
  },
  {
    kind: 'presentation',
    label: 'Generate presentation',
    description: 'Create a concise deck from this conversation',
    icon: Presentation
  },
  {
    kind: 'flow',
    label: 'Generate flow diagram',
    description: 'Map the process, handoffs, and decisions',
    icon: GitBranch
  },
  {
    kind: 'knowledge',
    label: 'Save as project data',
    description: 'Extract useful facts into the project knowledge base',
    icon: BookMarked
  }
]

export function ChatAssistantActions({
  content,
  projectId,
  disabled,
  compact = false,
  onCreated
}: ChatAssistantActionsProps) {
  const [working, setWorking] = useState<GeneratedArtifactKind | null>(null)

  const runAction = async (kind: GeneratedArtifactKind) => {
    if (!projectId) {
      toast.error('Link this chat to a project before creating an artifact')
      return
    }
    if (!content.trim() || working) return

    setWorking(kind)
    try {
      if (kind === 'document') {
        const title = `From chat — ${new Date().toLocaleDateString()}`
        const result = await window.electronAPI.chat.generateRequirement({
          projectId,
          type: 'requirements',
          style: 'chatgpt',
          title,
          prompt: `Create a polished requirements document from this conversation answer. Preserve the important facts, decisions, requirements, open questions, and next steps.\n\n${content.slice(0, 12000)}`
        })
        if (!result.success || !result.data) throw new Error(result.error ?? 'Document generation failed')
        onCreated?.({
          id: result.data.id,
          kind,
          title: result.data.title,
          description: 'Requirements document generated from chat',
          href: `/project/${projectId}/editor/${result.data.id}`
        })
        toast.success('Document generated')
      }

      if (kind === 'presentation') {
        const result = await window.electronAPI.presentations.generate({
          projectId,
          prompt: `Create a presentation from this conversation answer. Focus on the narrative, key insights, decisions, and next steps.\n\n${content.slice(0, 12000)}`,
          themeId: 'modern' as PresentationThemeId,
          tone: 'clear and professional',
          cardCount: 5,
          includeKnowledge: true
        })
        if (!result.success || !result.data) throw new Error(result.error ?? 'Presentation generation failed')
        const created = await window.electronAPI.presentations.create({
          projectId,
          title: result.data.title,
          description: result.data.summary,
          themeId: result.data.themeId,
          cards: result.data.cards
        })
        if (!created.success || !created.data) throw new Error(created.error ?? 'Presentation could not be saved')
        onCreated?.({
          id: created.data.id,
          kind,
          title: created.data.title,
          description: `${result.data.sources.length > 0 ? `${result.data.sources.length} source${result.data.sources.length === 1 ? '' : 's'} · ` : ''}Presentation generated from chat`,
          href: `/project/${projectId}/presentations/${created.data.id}`
        })
        toast.success('Presentation generated')
      }

      if (kind === 'flow') {
        const generated = await window.electronAPI.flows.generate({
          projectId,
          prompt: `Create a process flow diagram based on this conversation answer:\n\n${content.slice(0, 12000)}`,
          category: 'process' as FlowCategory
        })
        if (!generated.success || !generated.data) throw new Error(generated.error ?? 'Flow generation failed')
        const created = await window.electronAPI.flows.create({
          projectId,
          title: 'From chat',
          description: generated.data.summary ?? 'Flow generated from chat',
          category: 'process',
          nodes: generated.data.nodes,
          edges: generated.data.edges
        })
        if (!created.success || !created.data) throw new Error(created.error ?? 'Flow could not be saved')
        onCreated?.({
          id: created.data.id,
          kind,
          title: created.data.title,
          description: 'Process flow generated from chat',
          href: `/project/${projectId}/flows/${created.data.id}`
        })
        toast.success('Flow diagram generated')
      }

      if (kind === 'knowledge') {
        const result = await window.electronAPI.knowledge.extract({ projectId, text: content })
        if (!result.success) throw new Error(result.error ?? 'Knowledge extraction failed')
        onCreated?.({
          id: `knowledge-${Date.now()}`,
          kind,
          title: 'Project data updated',
          description: 'Useful facts from this answer were added to the knowledge base',
          href: `/project/${projectId}/knowledge`
        })
        toast.success('Project data updated')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create artifact')
    } finally {
      setWorking(null)
    }
  }

  const isDisabled = disabled || !content.trim() || working !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={compact ? 'h-8 gap-1 rounded-full px-2.5 text-xs' : 'h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground'}
          disabled={disabled}
        >
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {compact ? 'Advanced' : 'Generate'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Create from this answer
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIONS.map(({ kind, label, description, icon: Icon }) => (
          <DropdownMenuItem
            key={kind}
            disabled={isDisabled}
            onClick={() => void runAction(kind)}
            className="items-start gap-3 py-2.5"
          >
            {working === kind ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{description}</span>
            </span>
          </DropdownMenuItem>
        ))}
        {!projectId && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-[11px] leading-4 text-muted-foreground">
              Link a project in the chat context bar to save generated work.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
