import { useState } from 'react'
import { Sparkles, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Spinner } from '@/shared/components/ui/spinner'
import { buildDescriptionFromPayload } from '../../services/requestDescription'
import type { ApiRequest } from '../../types/api.types'

interface NotesTabProps {
  request: ApiRequest
  description: string
  onChange: (description: string) => void
  onGenerateWithAI?: () => Promise<void>
}

export function NotesTab({ request, description, onChange, onGenerateWithAI }: NotesTabProps) {
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    try {
      if (onGenerateWithAI) {
        await onGenerateWithAI()
        return
      }
      const res = await window.electronAPI.apiStudio.ai.describeRequest({ request })
      if (res.success && res.data?.trim()) {
        onChange(res.data.trim())
        toast.success('Description generated from request')
        return
      }
      onChange(buildDescriptionFromPayload(request))
      if (res.error) toast.message('Used local summary', { description: res.error })
      else toast.success('Description generated from payload')
    } catch {
      onChange(buildDescriptionFromPayload(request))
      toast.success('Description generated from payload')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
            Notes & description
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Saved with this request so you remember context next time. Generate from the current URL and body, or write your own.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 text-xs"
          disabled={generating}
          onClick={() => void handleGenerate()}
        >
          {generating ? <Spinner size="sm" className="text-current" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generate from payload
        </Button>
      </div>

      <Textarea
        value={description}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'e.g. Creates a delivery and attaches carrier notes.\nBody: deliveryId, signature, attachments…'}
        className="min-h-0 flex-1 resize-none text-sm leading-relaxed"
      />
    </div>
  )
}
