import { Sparkles, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function EmptyStateIllustrated({
  variant = 'default',
  title,
  description,
  onAction,
  action,
  actionLabel
}: {
  variant?: 'projects' | 'chat' | 'documents' | 'default'
  title?: string
  description?: string
  onAction?: () => void
  action?: ReactNode
  actionLabel?: string
}) {
  const configs = {
    projects: {
      title: 'No projects yet',
      description: 'Create a project to organize documents and conversations.',
      actionLabel: 'New Project'
    },
    chat: {
      title: 'No conversation selected',
      description: 'Start a new chat or pick one from the list.',
      actionLabel: 'New Chat'
    },
    documents: {
      title: 'No documents',
      description: 'Create or generate a requirement document.',
      actionLabel: 'New Document'
    },
    default: {
      title: 'Nothing here',
      description: 'Get started using the actions below.',
      actionLabel: 'Continue'
    }
  }

  const config = configs[variant]

  return (
    <EmptyState
      icon={<Sparkles className="h-5 w-5" />}
      title={title ?? config.title}
      description={description ?? config.description}
      action={
        action ??
        (onAction && (
          <Button onClick={onAction}>
            {actionLabel ?? config.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ))
      }
    />
  )
}

export { Spinner } from './spinner'
