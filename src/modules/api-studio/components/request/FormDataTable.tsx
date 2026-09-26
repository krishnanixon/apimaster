import { Plus, Trash2, Paperclip } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import type { FormDataField } from '../../types/api.types'
import { ExpandableField } from '../ExpandableField'

interface FormDataTableProps {
  fields: FormDataField[]
  onChange: (fields: FormDataField[]) => void
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function FormDataTable({ fields, onChange }: FormDataTableProps) {
  function update(id: string, patch: Partial<FormDataField>) {
    const next = fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
    const last = next[next.length - 1]
    if (last && last.key.trim()) next.push(emptyField())
    onChange(next)
  }

  function remove(id: string) {
    const next = fields.filter((f) => f.id !== id)
    onChange(next.length > 0 ? next : [emptyField()])
  }

  async function pickFile(id: string, file: File | undefined) {
    if (!file) return
    const base64 = await fileToBase64(file)
    update(id, { fileName: file.name, fileContentType: file.type, fileBase64: base64, value: file.name })
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      <div className="grid grid-cols-[24px_1fr_1fr_70px_32px] gap-2 bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span />
        <span>Key</span>
        <span>Value</span>
        <span>Type</span>
        <span />
      </div>
      {fields.map((field) => (
        <div key={field.id} className="grid grid-cols-[24px_1fr_1fr_70px_32px] items-start gap-2 px-2.5 py-1.5">
          <input
            type="checkbox"
            checked={field.enabled}
            onChange={(e) => update(field.id, { enabled: e.target.checked })}
            className="mt-2 h-3.5 w-3.5 rounded border-border accent-primary"
          />
          <ExpandableField
            value={field.key}
            onChange={(key) => update(field.id, { key })}
            placeholder="Key"
            compact
            className={cn(!field.enabled && 'opacity-50')}
          />
          {field.type === 'file' ? (
            <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-accent">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{field.fileName || 'Choose file'}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => void pickFile(field.id, e.target.files?.[0])}
              />
            </label>
          ) : (
            <ExpandableField
              value={field.value}
              onChange={(value) => update(field.id, { value })}
              placeholder="Value"
              compact
              className={cn(!field.enabled && 'opacity-50')}
            />
          )}
          <button
            type="button"
            onClick={() => update(field.id, { type: field.type === 'file' ? 'text' : 'file' })}
            className="mt-0.5 rounded-md border border-border px-1.5 py-1 text-[11px] capitalize text-muted-foreground hover:bg-accent"
          >
            {field.type}
          </button>
          <Button variant="ghost" size="icon" className="mt-0.5 h-7 w-7" onClick={() => remove(field.id)}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, emptyField()])}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Add field
      </button>
    </div>
  )
}

function emptyField(): FormDataField {
  return { id: uuidv4(), key: '', value: '', enabled: true, type: 'text' }
}
