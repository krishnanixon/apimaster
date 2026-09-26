import { v4 as uuidv4 } from 'uuid'
import { Sparkles } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Spinner } from '@/shared/components/ui/spinner'
import { KeyValueTable } from '../KeyValueTable'
import { FormDataTable } from './FormDataTable'
import { RequestCodeEditor } from '../RequestCodeEditor'
import { parseUrlEncoded, stringifyUrlEncoded } from '../../services/requestBuilder'
import type { RequestBody, RequestBodyType } from '../../types/api.types'

interface BodyTabProps {
  body: RequestBody
  onChange: (body: RequestBody) => void
  onFillWithAI?: () => Promise<void>
  fillingAI?: boolean
}

const BODY_TYPES: { value: RequestBodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'URL Encoded' }
]

const EMPTY_JSON = '{\n  \n}'

export function BodyTab({ body, onChange, onFillWithAI, fillingAI }: BodyTabProps) {
  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
        {BODY_TYPES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              onChange(
                opt.value === 'form-data'
                  ? {
                      type: opt.value,
                      content: '',
                      formData: body.formData ?? [
                        { id: uuidv4(), key: '', value: '', enabled: true, type: 'text' }
                      ]
                    }
                  : opt.value === 'json' && !body.content.trim()
                    ? { type: opt.value, content: EMPTY_JSON }
                    : { type: opt.value, content: body.content }
              )
            }
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition-colors',
              body.type === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            {opt.label}
          </button>
        ))}
        {onFillWithAI && body.type !== 'form-data' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1 text-xs"
            disabled={fillingAI}
            onClick={() => void onFillWithAI()}
          >
            {fillingAI ? <Spinner size="sm" className="text-current" /> : <Sparkles className="h-3.5 w-3.5" />}
            Fill with AI
          </Button>
        )}
      </div>

      {body.type === 'none' && (
        <p className="text-xs text-muted-foreground">This request does not have a body.</p>
      )}

      {(body.type === 'json' || body.type === 'text') && (
        <RequestCodeEditor
          value={body.content}
          onChange={(content) => onChange({ ...body, content })}
          languageFile={body.type === 'json' ? 'body.json' : 'body.txt'}
          placeholder={body.type === 'json' ? '{ "key": "value" }' : 'Raw request body'}
          showFormat={body.type === 'json'}
          className="min-h-0 flex-1"
        />
      )}

      {body.type === 'x-www-form-urlencoded' && (
        <div className="min-h-0 flex-1 overflow-auto">
          <KeyValueTable
            pairs={parseUrlEncoded(body.content)}
            onChange={(pairs) => onChange({ ...body, content: stringifyUrlEncoded(pairs) })}
          />
        </div>
      )}

      {body.type === 'form-data' && (
        <div className="min-h-0 flex-1 overflow-auto">
          <FormDataTable
            fields={body.formData ?? []}
            onChange={(formData) => onChange({ ...body, formData })}
          />
        </div>
      )}
    </div>
  )
}
