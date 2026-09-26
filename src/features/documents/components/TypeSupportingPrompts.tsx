import type { DocumentType } from '@shared/types'
import { TYPE_SUPPORTING_PROMPTS } from '@/features/documents/lib/generation-options'
import { Textarea } from '@/shared/components/ui/textarea'
import { Input } from '@/shared/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'

interface TypeSupportingPromptsProps {
  docType: DocumentType
  values: Record<string, string>
  onChange: (id: string, value: string) => void
}

export function TypeSupportingPrompts({ docType, values, onChange }: TypeSupportingPromptsProps) {
  const fields = TYPE_SUPPORTING_PROMPTS[docType] ?? []

  if (fields.length === 0) return null

  return (
    <Card className="bg-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Supporting prompts</CardTitle>
        <CardDescription>
          Optional details that make the generated document more accurate and complete
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((field) => (
          <div key={field.id}>
            <label className="mb-1.5 block text-sm font-medium">{field.label}</label>
            {field.hint && <p className="mb-1.5 text-xs text-muted-foreground">{field.hint}</p>}
            {field.multiline ? (
              <Textarea
                value={values[field.id] ?? ''}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                rows={2}
                className="resize-none"
              />
            ) : (
              <Input
                value={values[field.id] ?? ''}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
