import { useState } from 'react'
import { CheckCircle2, XCircle, PlayCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { RequestCodeEditor } from '../RequestCodeEditor'
import type { ApiTestResult } from '../../types/api.types'

interface TestsTabProps {
  script: string
  onChange: (script: string) => void
  testResults: ApiTestResult[]
  hasResponse: boolean
  onRunTests: () => Promise<void>
  onGenerateWithAI: () => Promise<void>
}

const PLACEHOLDER = `pm.test("status is 200", function () {
  if (pm.response.status !== 200) throw new Error("Expected 200, got " + pm.response.status)
})`

export function TestsTab({ script, onChange, testResults, hasResponse, onRunTests, onGenerateWithAI }: TestsTabProps) {
  const [running, setRunning] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function handleRun() {
    setRunning(true)
    try {
      await onRunTests()
    } finally {
      setRunning(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      await onGenerateWithAI()
    } catch {
      toast.error('Failed to generate tests')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <p className="text-xs text-muted-foreground">Runs in a sandboxed script context after each response.</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => void handleGenerate()} disabled={generating || !hasResponse}>
            {generating ? <Spinner size="sm" className="text-current" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI Generate
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void handleRun()} disabled={running || !hasResponse || !script.trim()}>
            {running ? <Spinner size="sm" className="text-current" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Run Tests
          </Button>
        </div>
      </div>

      <RequestCodeEditor
        value={script}
        onChange={onChange}
        languageFile="tests.js"
        placeholder={PLACEHOLDER}
        className="min-h-0 flex-1"
      />

      {testResults.length > 0 && (
        <div className="mt-3 max-h-32 shrink-0 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {testResults.map((result, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {result.passed ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              <div className="min-w-0">
                <span className={result.passed ? 'text-foreground' : 'text-red-500'}>{result.name}</span>
                {result.error && <p className="text-muted-foreground">{result.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
