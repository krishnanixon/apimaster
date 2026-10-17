/**
 * Example request bodies from Python data classes: Pydantic/SQLModel models (FastAPI),
 * DRF serializers and the Django models they wrap.
 */
import type { BodySchema } from '../../../../types/ai-engineer'
import { parseCall, pyString, pyStringList, splitTopLevel, type PyClass, type PyModule } from './source'

const ISO_DATE = '2024-01-01T00:00:00.000Z'
const MAX_DEPTH = 2
const PYDANTIC_BASES = /\b(BaseModel|SQLModel|Schema|BaseSchema|RootModel)\b/
const DJANGO_MODEL_BASES = /\b(models\.Model|Model)\b/
const READ_ONLY_SERIALIZER_FIELDS = /^(SerializerMethodField|ReadOnlyField|HiddenField|HyperlinkedIdentityField)$/

interface IndexedClass {
  cls: PyClass
  file: string
  /** Nested classes (e.g. DRF `Meta`). */
  inner: PyClass[]
}

/** First literal value of a Python expression usable in JSON, else undefined. */
function literal(expr: string | undefined): unknown {
  if (expr === undefined) return undefined
  const text = expr.trim()
  const str = pyString(text)
  if (str !== null) return str
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  if (text === 'True') return true
  if (text === 'False') return false
  if (text === 'None') return null
  return undefined
}

/** Top-level `name: Type [= default]` lines of a class body. */
function annotatedFields(cls: PyClass): Array<{ name: string; type: string; value?: string }> {
  const bodyIndent = cls.body[0]?.indent
  const fields: Array<{ name: string; type: string; value?: string }> = []
  for (const line of cls.body) {
    if (line.indent !== bodyIndent) continue
    const m = line.text.match(/^([A-Za-z_]\w*)\s*:\s*([\s\S]+)$/)
    if (!m || m[1] === 'model_config' || m[1].startsWith('_')) continue
    const [type, value] = splitTopLevel(m[2], '=')
    if (/^ClassVar\b/.test(type)) continue
    fields.push({ name: m[1], type: type.trim(), value: value?.trim() })
  }
  return fields
}

/** Top-level `name = expr` lines of a class body. */
function assignedFields(cls: PyClass): Array<{ name: string; value: string }> {
  const bodyIndent = cls.body[0]?.indent
  return cls.body
    .filter((line) => line.indent === bodyIndent)
    .flatMap((line) => {
      const m = line.text.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/)
      return m ? [{ name: m[1], value: m[2].trim() }] : []
    })
}

function unwrapOptional(type: string): string {
  let t = type.trim()
  for (;;) {
    const wrapped = t.match(/^(?:typing\.)?(Optional|Annotated|Required|NotRequired)\[([\s\S]+)\]$/)
    if (wrapped) {
      t = splitTopLevel(wrapped[2])[0]
      continue
    }
    const union = t.match(/^(?:typing\.)?Union\[([\s\S]+)\]$/)
    const parts = (union ? splitTopLevel(union[1]) : splitTopLevel(t, '|')).map((p) => p.trim()).filter((p) => p !== 'None')
    if (parts.length && parts[0] !== t) {
      t = parts[0]
      continue
    }
    return t
  }
}

export class PythonModelIndex {
  private readonly classes = new Map<string, IndexedClass>()
  /** `CurrentUser = Annotated[User, Depends(get_current_user)]` */
  private readonly typeAliases = new Map<string, string>()

  add(file: string, module: PyModule): void {
    for (const a of module.assignments) {
      if (a.indent === 0 && /^(typing\.)?Annotated\[/.test(a.value) && !this.typeAliases.has(a.name)) this.typeAliases.set(a.name, a.value)
    }
    for (const cls of module.classes) {
      if (cls.parent) continue
      if (!this.classes.has(cls.name)) {
        this.classes.set(cls.name, { cls, file, inner: module.classes.filter((c) => c.parent === cls.name) })
      }
    }
  }

  /** Expands a type alias (`deps.CurrentUser` → `Annotated[User, Depends(get_current_user)]`). */
  expandAlias(type: string): string {
    const name = type.trim().split('.').pop() ?? type
    return this.typeAliases.get(name) ?? type
  }

  /** Default of a field on a pydantic `BaseSettings` class, e.g. `settings.API_V1_STR` → `/api/v1`. */
  settingsDefault(field: string): string | null {
    for (const { cls } of this.classes.values()) {
      if (!cls.bases.some((b) => /Settings\b/.test(b))) continue
      const match = annotatedFields(cls).find((f) => f.name === field)
      const value = match?.value ? pyString(match.value) : null
      if (value !== null) return value
    }
    return null
  }

  get(name: string): IndexedClass | undefined {
    return this.classes.get(name.split('.').pop() ?? name)
  }

  private inherits(name: string, pattern: RegExp, seen = new Set<string>()): boolean {
    const entry = this.get(name)
    if (!entry || seen.has(entry.cls.name)) return false
    seen.add(entry.cls.name)
    return entry.cls.bases.some((base) => pattern.test(base) || this.inherits(base, pattern, seen))
  }

  isPydanticModel(name: string): boolean {
    return this.inherits(unwrapOptional(name), PYDANTIC_BASES)
  }

  isEnum(name: string): boolean {
    return this.inherits(name, /\bEnum\b/)
  }

  /** `bases` chain first, so subclasses override inherited fields. */
  private lineage(name: string, seen = new Set<string>()): IndexedClass[] {
    const entry = this.get(name)
    if (!entry || seen.has(entry.cls.name)) return []
    seen.add(entry.cls.name)
    return [...entry.cls.bases.flatMap((base) => this.lineage(base, seen)), entry]
  }

  pydanticFieldNames(name: string): string[] {
    return this.lineage(unwrapOptional(name)).flatMap((e) => annotatedFields(e.cls).map((f) => f.name))
  }

  pydanticExample(name: string, depth = 0): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const entry of this.lineage(unwrapOptional(name))) {
      for (const field of annotatedFields(entry.cls)) out[field.name] = this.fieldExample(field.type, field.value, depth)
    }
    return out
  }

  /** Validation rules of a Pydantic model: field types, `Field(min_length=…, ge=…)`, required fields. */
  pydanticSchema(name: string, depth = 0): BodySchema {
    const properties: Record<string, BodySchema> = {}
    const required = new Set<string>()
    for (const entry of this.lineage(unwrapOptional(name))) {
      for (const field of annotatedFields(entry.cls)) {
        const call = field.value ? parseCall(field.value) : null
        const isField = Boolean(call && /(^|\.)Field$/.test(call.callee))
        const rules = { ...this.typeSchema(field.type, depth) }
        if (isField) {
          const num = (key: string) => {
            const v = literal(call!.keywords.get(key))
            return typeof v === 'number' ? v : undefined
          }
          const limits = { minLength: num('min_length'), maxLength: num('max_length'), minimum: num('ge'), maximum: num('le') }
          for (const [key, v] of Object.entries(limits)) if (v !== undefined) rules[key as keyof typeof limits] = v
        }
        properties[field.name] = rules
        // Pydantic: a field without a default is required (`Field(...)` is an explicit "no default").
        const noDefault = !field.value || (isField && (call!.positional[0]?.trim() === '...' || (!call!.positional.length && !call!.keywords.has('default') && !call!.keywords.has('default_factory'))))
        if (noDefault) required.add(field.name)
        else required.delete(field.name)
      }
    }
    return { type: 'object', properties, required: [...required] }
  }

  private typeSchema(type: string, depth: number): BodySchema {
    const t = unwrapOptional(type)
    const generic = t.match(/^(?:typing\.)?(\w+)\[([\s\S]*)\]$/)
    const head = (generic ? generic[1] : t).split('.').pop() ?? t
    const call = parseCall(t)
    const callNum = (key: string) => {
      const v = literal(call?.keywords.get(key))
      return typeof v === 'number' ? v : undefined
    }
    if (/^(list|List|set|Set|Sequence|tuple|Tuple|frozenset|conlist)$/.test(head)) return { type: 'array' }
    if (/^(dict|Dict|Mapping)$/.test(head)) return { type: 'object' }
    if (head === 'Literal' && generic) return { enum: splitTopLevel(generic[2]).map((v) => literal(v)) }
    if (/^constr\(/.test(t)) return { type: 'string', minLength: callNum('min_length'), maxLength: callNum('max_length') }
    if (/^(str|SecretStr|Text)$/.test(head)) return { type: 'string' }
    if (/^conint\(/.test(t)) return { type: 'integer', minimum: callNum('ge'), maximum: callNum('le') }
    if (/^(int|StrictInt)$/.test(head)) return { type: 'integer' }
    if (head === 'PositiveInt') return { type: 'integer', minimum: 1 }
    if (head === 'NonNegativeInt') return { type: 'integer', minimum: 0 }
    if (/^(float|confloat|Decimal|condecimal)$/.test(head)) return { type: 'number' }
    if (/^(bool|StrictBool)$/.test(head)) return { type: 'boolean' }
    if (head === 'EmailStr' || head === 'NameEmail') return { type: 'string', format: 'email' }
    if (/Url$/.test(head)) return { type: 'string', format: 'uri' }
    if (/^UUID\d?$/.test(head)) return { type: 'string', format: 'uuid' }
    if (head === 'datetime') return { type: 'string', format: 'date-time' }
    if (head === 'date') return { type: 'string', format: 'date' }
    if (this.isEnum(head)) return { enum: assignedFields(this.get(head)!.cls).map((f) => literal(f.value) ?? f.name) }
    if (depth < MAX_DEPTH && this.isPydanticModel(head)) return this.pydanticSchema(head, depth + 1)
    return {}
  }

  private fieldExample(type: string, value: string | undefined, depth: number): unknown {
    if (value) {
      const call = parseCall(value)
      if (call && /(^|\.)Field$/.test(call.callee)) {
        const example = literal(call.keywords.get('example'))
        if (example !== undefined) return example
        const examples = call.keywords.get('examples')
        const first = examples ? literal(splitTopLevel(examples.replace(/^\[|\]$/g, ''))[0]) : undefined
        if (first !== undefined) return first
        const fallback = literal(call.keywords.get('default') ?? call.positional[0])
        if (fallback !== undefined && fallback !== null) return fallback
      } else {
        const fallback = literal(value)
        if (fallback !== undefined && fallback !== null) return fallback
      }
    }
    return this.typeExample(type, depth)
  }

  typeExample(type: string, depth = 0): unknown {
    const t = unwrapOptional(type)
    const generic = t.match(/^(?:typing\.)?(\w+)\[([\s\S]*)\]$/)
    const head = (generic ? generic[1] : t).split('.').pop() ?? t
    if (/^(list|List|set|Set|Sequence|tuple|Tuple|frozenset|conlist)$/.test(head)) return []
    if (/^(dict|Dict|Mapping|Json|JSON)$/.test(head)) return {}
    if (head === 'Literal' && generic) return literal(splitTopLevel(generic[2])[0]) ?? ''
    if (/^(str|constr|SecretStr|Text)$/.test(head)) return ''
    if (/^(int|conint|PositiveInt|NonNegativeInt|float|confloat|Decimal|condecimal)$/.test(head)) return 0
    if (/^(bool|StrictBool)$/.test(head)) return false
    if (head === 'EmailStr' || head === 'NameEmail') return 'user@example.com'
    if (/Url$/.test(head)) return 'https://example.com'
    if (/^UUID\d?$/.test(head)) return '00000000-0000-0000-0000-000000000000'
    if (head === 'datetime') return ISO_DATE
    if (head === 'date') return '2024-01-01'
    if (this.isEnum(head)) {
      const first = assignedFields(this.get(head)!.cls)[0]
      return first ? (literal(first.value) ?? first.name) : ''
    }
    if (depth < MAX_DEPTH && this.isPydanticModel(head)) return this.pydanticExample(head, depth + 1)
    return ''
  }

  // ── Django / DRF ──────────────────────────────────────────────────────────

  private djangoFieldExample(value: string): unknown {
    const call = parseCall(value)
    if (!call) return undefined
    const kind = call.callee.split('.').pop() ?? ''
    if (/^(Big|Small)?AutoField$/.test(kind)) return undefined
    if (call.keywords.get('auto_now') === 'True' || call.keywords.get('auto_now_add') === 'True') return undefined
    if (call.keywords.get('editable') === 'False') return undefined
    return this.djangoTypeExample(kind, call.keywords)
  }

  private djangoTypeExample(kind: string, keywords: Map<string, string>): unknown {
    if (/^(EmailField)$/.test(kind)) return 'user@example.com'
    if (/^(URLField|HyperlinkedRelatedField)$/.test(kind)) return 'https://example.com'
    if (/^UUIDField$/.test(kind)) return '00000000-0000-0000-0000-000000000000'
    if (/(Integer|Float|Decimal|Duration)Field$/.test(kind)) return 0
    if (/Boolean/.test(kind)) return false
    if (kind === 'DateTimeField') return ISO_DATE
    if (kind === 'DateField') return '2024-01-01'
    if (/^(JSONField|DictField|HStoreField)$/.test(kind)) return {}
    if (/^(ListField|MultipleChoiceField|ArrayField|ManyToManyField)$/.test(kind)) return []
    if (/^(ForeignKey|OneToOneField|PrimaryKeyRelatedField|SlugRelatedField)$/.test(kind)) {
      return keywords.get('many') === 'True' ? [1] : 1
    }
    return ''
  }

  /** Writable fields of a Django model: `name = models.CharField(...)`. */
  djangoModelExample(name: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const entry of this.lineage(name)) {
      if (!entry.cls.bases.some((b) => DJANGO_MODEL_BASES.test(b)) && !this.inherits(entry.cls.name, DJANGO_MODEL_BASES)) continue
      for (const field of assignedFields(entry.cls)) {
        const example = this.djangoFieldExample(field.value)
        if (example !== undefined) out[field.name] = example
      }
    }
    return out
  }

  // ── marshmallow ─────────────────────────────────────────────────────────

  /** A marshmallow schema: fields declared as `name = fields.Str()`. */
  isMarshmallowSchema(name: string): boolean {
    return this.lineage(name).some((e) => assignedFields(e.cls).some((f) => /^(ma\.)?fields\.\w+\(/.test(f.value)))
  }

  marshmallowExample(name: string, depth = 0): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const entry of this.lineage(name)) {
      for (const field of assignedFields(entry.cls)) {
        const call = parseCall(field.value)
        if (!call || !/^(ma\.)?fields\./.test(call.callee)) continue
        if (call.keywords.get('dump_only') === 'True') {
          delete out[field.name]
          continue
        }
        const kind = call.callee.split('.').pop() ?? ''
        const key = pyString(call.keywords.get('data_key')) ?? field.name
        if (kind === 'Nested' || kind === 'Pluck') {
          const target = pyString(call.positional[0]) ?? call.positional[0]?.trim()
          if (!target || target === 'self' || depth >= MAX_DEPTH || !this.get(target)) continue
          const nested = this.marshmallowExample(target, depth + 1)
          out[key] = call.keywords.get('many') === 'True' ? [nested] : nested
          continue
        }
        out[key] = this.marshmallowTypeExample(kind)
      }
    }
    return out
  }

  private marshmallowTypeExample(kind: string): unknown {
    if (/^(Str|String|Raw|Constant)$/.test(kind)) return ''
    if (kind === 'Email') return 'user@example.com'
    if (/^(Url|URL)$/.test(kind)) return 'https://example.com'
    if (kind === 'UUID') return '00000000-0000-0000-0000-000000000000'
    if (/^(Int|Integer|Float|Decimal|Number)$/.test(kind)) return 0
    if (/^(Bool|Boolean)$/.test(kind)) return false
    if (/^(DateTime|AwareDateTime|NaiveDateTime)$/.test(kind)) return ISO_DATE
    if (kind === 'Date') return '2024-01-01'
    if (/^(List|Tuple)$/.test(kind)) return []
    if (/^(Dict|Mapping)$/.test(kind)) return {}
    return ''
  }

  isSerializer(name: string): boolean {
    return this.inherits(name, /Serializer\b/)
  }

  /** Writable fields a DRF serializer accepts, with example values. */
  serializerExample(name: string, depth = 0): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const entry of this.lineage(name)) {
      const meta = entry.inner.find((c) => c.name === 'Meta')
      const metaFields = new Map((meta ? assignedFields(meta) : []).map((f) => [f.name, f.value]))
      const readOnly = new Set(pyStringList(metaFields.get('read_only_fields')) ?? [])
      const excluded = new Set(pyStringList(metaFields.get('exclude')) ?? [])
      const modelName = metaFields.get('model')?.trim()
      const modelExample = modelName ? this.djangoModelExample(modelName) : {}

      const listed = metaFields.get('fields')
      const names = listed?.includes('__all__') ? Object.keys(modelExample) : (pyStringList(listed) ?? [])
      for (const field of names) {
        if (readOnly.has(field) || excluded.has(field) || field === 'id' || field === 'pk') continue
        if (field in modelExample || !modelName) out[field] = modelExample[field] ?? ''
      }

      for (const field of assignedFields(entry.cls)) {
        const call = parseCall(field.value)
        if (!call) continue
        const kind = call.callee.split('.').pop() ?? ''
        if (!/Field$|Serializer$|RelatedField$/.test(kind)) continue
        if (READ_ONLY_SERIALIZER_FIELDS.test(kind) || call.keywords.get('read_only') === 'True') {
          delete out[field.name]
          continue
        }
        let example: unknown
        if (/Serializer$/.test(kind) && depth < MAX_DEPTH && this.get(kind)) {
          const nested = this.serializerExample(kind, depth + 1)
          example = call.keywords.get('many') === 'True' ? [nested] : nested
        } else {
          example = this.djangoTypeExample(kind, call.keywords)
        }
        out[field.name] = example
      }
    }
    return out
  }
}
