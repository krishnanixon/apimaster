export interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string }>
  required?: string[]
  additionalProperties?: boolean
}

export interface AssistantTool {
  name: string
  description: string
  inputSchema: JsonSchema
  riskLevel: 'read' | 'write' | 'destructive'
  execute(input: unknown): Promise<{ ok: boolean; output: string }>
}

export function validateToolInput(
  schema: JsonSchema,
  input: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Tool input must be an object.' }
  }
  const record = input as Record<string, unknown>
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!(key in schema.properties)) {
        return { ok: false, error: `Unexpected property: ${key}` }
      }
    }
  }
  for (const required of schema.required ?? []) {
    if (!(required in record) || record[required] === undefined || record[required] === '') {
      return { ok: false, error: `Missing required property: ${required}` }
    }
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in record) || record[key] === undefined) continue
    const actual = typeof record[key]
    if (spec.type === 'string' && actual !== 'string') {
      return { ok: false, error: `${key} must be a string.` }
    }
    if (spec.type === 'number' && actual !== 'number') {
      return { ok: false, error: `${key} must be a number.` }
    }
    if (spec.type === 'boolean' && actual !== 'boolean') {
      return { ok: false, error: `${key} must be a boolean.` }
    }
  }
  return { ok: true, value: record }
}
