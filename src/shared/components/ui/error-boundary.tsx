import { Component, type ErrorInfo, type ReactNode } from 'react'
import { MessageSquareWarning, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from './button'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown above the error message so the user knows what failed. */
  title?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Keeps a render failure contained to one region. Without this, any thrown
 * error unmounts the whole app and leaves a blank window.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Render error', error, info.componentStack)
    void window.electronAPI?.log?.write({
      level: 'error',
      message: `${error.message}\n${info.componentStack ?? ''}`,
      context: 'Renderer'
    })
  }

  private reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-auto p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <div className="max-w-lg">
          <h2 className="text-[15px] font-semibold">{this.props.title ?? 'Something went wrong'}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            This view failed to render. The rest of the app is still usable.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/50 p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
            {error.message}
          </pre>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={this.reset}>
            <RotateCcw className="h-3.5 w-3.5" />Try again
          </Button>
          <Button size="sm" variant="outline" onClick={() => { window.location.hash = '/diagnostics' }}>
            <MessageSquareWarning className="h-3.5 w-3.5" />Report this problem
          </Button>
        </div>
      </div>
    )
  }
}
