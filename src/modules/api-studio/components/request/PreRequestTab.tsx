import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { RequestCodeEditor } from '../RequestCodeEditor'

interface PreRequestTabProps {
  script: string
  onChange: (script: string) => void
  onGenerateWithAI?: () => Promise<void>
  parentScripts?: { sourceName: string; script: string }[]
}

const PLACEHOLDER = `// Set environment variables before the request is sent
pm.environment.set("token", "your-value")
pm.variables.set("userId", "123")`

export function PreRequestTab({ script, onChange, onGenerateWithAI, parentScripts = [] }: PreRequestTabProps) {
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    if (!onGenerateWithAI) return
    setGenerating(true)
    try {
      await onGenerateWithAI()
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Runs before each request. Use <code className="text-foreground">pm.environment.set(key, value)</code> to update
          active environment variables.
          {parentScripts.length > 0 && (
            <>
              {' '}
              Parent scripts from {parentScripts.map((p) => `"${p.sourceName}"`).join(', ')} run first.
            </>
          )}
        </p>
        {onGenerateWithAI && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 text-xs"
            disabled={generating}
            onClick={() => void handleGenerate()}
          >
            {generating ? <Spinner size="sm" className="text-current" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI Generate
          </Button>
        )}
      </div>
      <RequestCodeEditor
        value={script}
        onChange={onChange}
        languageFile="pre-request.js"
        placeholder={PLACEHOLDER}
        className="min-h-0 flex-1"
      />
    </div>
  )
}

