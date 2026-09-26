import { useMemo, useState, type ReactNode } from 'react'
import {
  Braces,
  Eye,
  FileCheck2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Type
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Slider } from '@/shared/components/ui/slider'
import { Switch } from '@/shared/components/ui/switch'
import { cn } from '@/shared/lib/utils'
import {
  DEFAULT_EDITOR_SETTINGS,
  useEditorSettingsStore,
  type EditorSettings
} from '../stores/editorSettings.store'
import { useWorkbenchLayoutStore } from '../stores/workbench.store'

type SettingsCategory = 'appearance' | 'editing' | 'display' | 'intelligence' | 'files'

const CATEGORIES: Array<{
  id: SettingsCategory
  label: string
  description: string
  icon: typeof Type
}> = [
  { id: 'appearance', label: 'Appearance', description: 'Font and density', icon: Type },
  { id: 'editing', label: 'Editing', description: 'Tabs, wrap and cursor', icon: SlidersHorizontal },
  { id: 'display', label: 'Display', description: 'Gutters and guides', icon: Eye },
  { id: 'intelligence', label: 'Intelligence', description: 'Code and AI assistance', icon: Sparkles },
  { id: 'files', label: 'Files & Save', description: 'Saving and formatting', icon: FileCheck2 }
]

const CATEGORY_KEYS: Record<SettingsCategory, Array<keyof EditorSettings>> = {
  appearance: ['fontFamily', 'fontSize', 'lineHeight', 'fontLigatures'],
  editing: [
    'tabSize',
    'insertSpaces',
    'wordWrap',
    'wordWrapColumn',
    'cursorStyle',
    'cursorBlink',
    'smoothScrolling',
    'scrollPastEnd'
  ],
  display: [
    'lineNumbers',
    'minimap',
    'indentGuides',
    'highlightActiveLine',
    'highlightSelectionMatches',
    'foldGutter',
    'renderWhitespace',
    'stickyBreadcrumbs',
    'gitGutter'
  ],
  intelligence: [
    'autocomplete',
    'bracketMatching',
    'closeBrackets',
    'showDiagnostics',
    'hoverDocumentation',
    'aiTabCompletions',
    'aiNextEditPrediction',
    'breakpointGutter'
  ],
  files: ['autoSave', 'autoSaveDelayMs', 'formatOnSave']
}

const SETTINGS_INDEX: Record<SettingsCategory, string[]> = {
  appearance: ['font family', 'font size', 'line height', 'font ligatures'],
  editing: [
    'tab size',
    'insert spaces',
    'word wrap',
    'wrap column',
    'cursor style',
    'cursor blink',
    'smooth scrolling',
    'scroll past end'
  ],
  display: [
    'line numbers',
    'minimap',
    'indent guides',
    'active line',
    'selection matches',
    'fold gutter',
    'whitespace',
    'breadcrumbs',
    'git change gutter'
  ],
  intelligence: [
    'autocomplete',
    'bracket matching',
    'auto close brackets',
    'inline diagnostics',
    'hover documentation',
    'tab ai completions',
    'next edit prediction',
    'breakpoint gutter'
  ],
  files: ['auto save', 'save delay', 'format on save']
}

const FONT_OPTIONS = [
  {
    label: 'JetBrains / Fira Code',
    value:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  },
  {
    label: 'SF Mono',
    value: "'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  },
  {
    label: 'Cascadia Code',
    value: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace"
  },
  {
    label: 'System monospace',
    value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  }
]

export function EditorSettingsDialog() {
  const open = useWorkbenchLayoutStore((state) => state.settingsOpen)
  const setOpen = useWorkbenchLayoutStore((state) => state.setSettingsOpen)
  const settings = useEditorSettingsStore()
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  const modifiedByCategory = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((category) => [
          category.id,
          CATEGORY_KEYS[category.id].filter(
            (key) => settings[key] !== DEFAULT_EDITOR_SETTINGS[key]
          ).length
        ])
      ) as Record<SettingsCategory, number>,
    [settings]
  )

  const rowVisible = (category: SettingsCategory, label: string) => {
    if (!normalizedQuery) return activeCategory === category
    const categoryMeta = CATEGORIES.find((item) => item.id === category)
    return `${categoryMeta?.label ?? category} ${categoryMeta?.description ?? ''} ${label}`
      .toLowerCase()
      .includes(normalizedQuery)
  }
  const categoryVisible = (category: SettingsCategory) =>
    SETTINGS_INDEX[category].some((label) => rowVisible(category, label))
  const searchHasResults = CATEGORIES.some((category) => categoryVisible(category.id))
  const visibleCategory = normalizedQuery ? null : activeCategory

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="wb-editor-settings !flex !h-[520px] !w-[720px] !max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] flex-col gap-0 overflow-hidden border-[var(--wb-border)] bg-[var(--wb-sidebar)] p-0 text-[var(--wb-fg)] shadow-[var(--wb-shadow)]">
        <DialogHeader className="shrink-0 space-y-0 border-b border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-4 py-3 pr-14">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-[15px]">Editor settings</DialogTitle>
              <DialogDescription className="mt-1 text-[11px] text-[var(--wb-muted)]">
                Changes apply instantly and stay with this device.
              </DialogDescription>
            </div>
            <label className="relative block w-56 shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--wb-muted)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search settings"
                aria-label="Search editor settings"
                className="h-7 border-[var(--wb-border)] bg-[var(--wb-editor)] pl-7 pr-2 text-[11px]"
              />
            </label>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav
            className="w-40 shrink-0 border-r border-[var(--wb-border)] bg-[var(--wb-activity)] p-1.5"
            aria-label="Editor settings categories"
          >
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              const selected = visibleCategory === category.id
              const hiddenBySearch = normalizedQuery && !categoryVisible(category.id)
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.id)
                    setQuery('')
                  }}
                  className={cn(
                    'mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                    selected
                      ? 'bg-[var(--wb-active)] text-[var(--wb-fg)]'
                      : 'text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]',
                    hiddenBySearch && 'hidden'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      selected && 'text-[var(--wb-accent)]'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">{category.label}</span>
                    <span className="block truncate text-[9px] opacity-70">
                      {category.description}
                    </span>
                  </span>
                  {modifiedByCategory[category.id] > 0 ? (
                    <span className="rounded-full bg-[var(--wb-accent)] px-1.5 text-[9px] text-white">
                      {modifiedByCategory[category.id]}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--wb-editor)] px-4 py-3">
            {!searchHasResults ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Search className="mb-2 h-5 w-5 text-[var(--wb-muted)]" />
                <p className="text-[12px] font-medium">No matching settings</p>
                <p className="mt-1 text-[10px] text-[var(--wb-muted)]">
                  Try a broader search term.
                </p>
              </div>
            ) : null}

            {categoryVisible('appearance') ? (
              <SettingsSection title="Appearance" description="Typography and editor density">
                <SettingRow
                  visible={rowVisible('appearance', 'font family')}
                  label="Font family"
                  description="Editor monospace font stack"
                >
                  <select
                    value={settings.fontFamily}
                    onChange={(event) => settings.set('fontFamily', event.target.value)}
                    className="h-7 w-48 border border-[var(--wb-border)] bg-[var(--wb-sidebar)] px-2 text-[10px] outline-none focus:border-[var(--wb-accent)]"
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font.label} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow
                  visible={rowVisible('appearance', 'font size')}
                  label="Font size"
                  description="Use Cmd/Ctrl + and − to zoom"
                >
                  <RangeControl
                    min={8}
                    max={32}
                    value={settings.fontSize}
                    suffix="px"
                    onChange={(value) => settings.set('fontSize', value)}
                  />
                </SettingRow>
                <SettingRow
                  visible={rowVisible('appearance', 'line height')}
                  label="Line height"
                  description="Vertical spacing between lines"
                >
                  <RangeControl
                    min={1.1}
                    max={2.2}
                    step={0.05}
                    value={settings.lineHeight}
                    precision={2}
                    onChange={(value) => settings.set('lineHeight', value)}
                  />
                </SettingRow>
                <ToggleRow
                  visible={rowVisible('appearance', 'font ligatures')}
                  label="Font ligatures"
                  description="Render programming character combinations"
                  checked={settings.fontLigatures}
                  onChange={() => settings.toggle('fontLigatures')}
                />
              </SettingsSection>
            ) : null}

            {categoryVisible('editing') ? (
              <SettingsSection
                title="Editing"
                description="Indentation, wrapping and cursor behavior"
              >
                <SettingRow
                  visible={rowVisible('editing', 'tab size')}
                  label="Tab size"
                  description="Spaces represented by a tab"
                >
                  <Segmented
                    value={settings.tabSize}
                    options={[2, 4, 8].map((value) => ({ value, label: String(value) }))}
                    onChange={(value) => settings.set('tabSize', value)}
                  />
                </SettingRow>
                <ToggleRow
                  visible={rowVisible('editing', 'insert spaces')}
                  label="Insert spaces"
                  description="Use spaces when pressing Tab"
                  checked={settings.insertSpaces}
                  onChange={() => settings.toggle('insertSpaces')}
                />
                <SettingRow
                  visible={rowVisible('editing', 'word wrap')}
                  label="Word wrap"
                  description="Wrap long lines in the viewport"
                >
                  <Segmented
                    value={settings.wordWrap}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'on', label: 'On' },
                      { value: 'bounded', label: 'Column' }
                    ]}
                    onChange={(value) => settings.set('wordWrap', value)}
                  />
                </SettingRow>
                {settings.wordWrap === 'bounded' ? (
                  <SettingRow
                    visible={rowVisible('editing', 'wrap column')}
                    label="Wrap column"
                    description="Maximum visual line width"
                  >
                    <RangeControl
                      min={60}
                      max={160}
                      step={10}
                      value={settings.wordWrapColumn}
                      onChange={(value) => settings.set('wordWrapColumn', value)}
                    />
                  </SettingRow>
                ) : null}
                <SettingRow
                  visible={rowVisible('editing', 'cursor style')}
                  label="Cursor style"
                  description="Insertion caret appearance"
                >
                  <Segmented
                    value={settings.cursorStyle}
                    options={[
                      { value: 'line', label: 'Line' },
                      { value: 'block', label: 'Block' },
                      { value: 'underline', label: 'Under' }
                    ]}
                    onChange={(value) => settings.set('cursorStyle', value)}
                  />
                </SettingRow>
                <ToggleRow
                  visible={rowVisible('editing', 'cursor blink')}
                  label="Cursor blink"
                  description="Animate the insertion caret"
                  checked={settings.cursorBlink}
                  onChange={() => settings.toggle('cursorBlink')}
                />
                <ToggleRow
                  visible={rowVisible('editing', 'smooth scrolling')}
                  label="Smooth scrolling"
                  description="Animate editor scrolling"
                  checked={settings.smoothScrolling}
                  onChange={() => settings.toggle('smoothScrolling')}
                />
                <ToggleRow
                  visible={rowVisible('editing', 'scroll past end')}
                  label="Scroll past end"
                  description="Leave space below the final line"
                  checked={settings.scrollPastEnd}
                  onChange={() => settings.toggle('scrollPastEnd')}
                />
              </SettingsSection>
            ) : null}

            {categoryVisible('display') ? (
              <SettingsSection title="Display" description="Visual guides, gutters and navigation">
                <ToggleRow visible={rowVisible('display', 'line numbers')} label="Line numbers" checked={settings.lineNumbers} onChange={() => settings.toggle('lineNumbers')} />
                <ToggleRow visible={rowVisible('display', 'minimap')} label="Minimap" description="Compact document overview" checked={settings.minimap} onChange={() => settings.toggle('minimap')} />
                <ToggleRow visible={rowVisible('display', 'indent guides')} label="Indent guides" checked={settings.indentGuides} onChange={() => settings.toggle('indentGuides')} />
                <ToggleRow visible={rowVisible('display', 'active line')} label="Highlight active line" checked={settings.highlightActiveLine} onChange={() => settings.toggle('highlightActiveLine')} />
                <ToggleRow visible={rowVisible('display', 'selection matches')} label="Selection matches" description="Highlight matching selected text" checked={settings.highlightSelectionMatches} onChange={() => settings.toggle('highlightSelectionMatches')} />
                <ToggleRow visible={rowVisible('display', 'fold gutter')} label="Fold gutter" checked={settings.foldGutter} onChange={() => settings.toggle('foldGutter')} />
                <SettingRow visible={rowVisible('display', 'whitespace')} label="Whitespace" description="Reveal spaces and trailing whitespace">
                  <Segmented
                    value={settings.renderWhitespace}
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'selection', label: 'Trailing' },
                      { value: 'all', label: 'All' }
                    ]}
                    onChange={(value) => settings.set('renderWhitespace', value)}
                  />
                </SettingRow>
                <ToggleRow visible={rowVisible('display', 'breadcrumbs')} label="Breadcrumbs" checked={settings.stickyBreadcrumbs} onChange={() => settings.toggle('stickyBreadcrumbs')} />
                <ToggleRow visible={rowVisible('display', 'git change gutter')} label="Git change gutter" description="Show added and modified lines" checked={settings.gitGutter} onChange={() => settings.toggle('gitGutter')} />
              </SettingsSection>
            ) : null}

            {categoryVisible('intelligence') ? (
              <SettingsSection
                title="Intelligence"
                description="Language features and AI assistance"
              >
                <ToggleRow visible={rowVisible('intelligence', 'autocomplete')} label="Autocomplete" checked={settings.autocomplete} onChange={() => settings.toggle('autocomplete')} />
                <ToggleRow visible={rowVisible('intelligence', 'bracket matching')} label="Bracket matching" checked={settings.bracketMatching} onChange={() => settings.toggle('bracketMatching')} />
                <ToggleRow visible={rowVisible('intelligence', 'auto close brackets')} label="Auto close brackets" checked={settings.closeBrackets} onChange={() => settings.toggle('closeBrackets')} />
                <ToggleRow visible={rowVisible('intelligence', 'inline diagnostics')} label="Inline diagnostics" description="Show errors and warnings in the editor" checked={settings.showDiagnostics} onChange={() => settings.toggle('showDiagnostics')} />
                <ToggleRow visible={rowVisible('intelligence', 'hover documentation')} label="Hover documentation" description="Show symbol information on pointer hover" checked={settings.hoverDocumentation} onChange={() => settings.toggle('hoverDocumentation')} />
                <ToggleRow visible={rowVisible('intelligence', 'tab ai completions')} label="Tab AI completions" description="Generate bounded inline suggestions" checked={settings.aiTabCompletions} onChange={() => settings.toggle('aiTabCompletions')} />
                <ToggleRow visible={rowVisible('intelligence', 'next edit prediction')} label="Next edit prediction" description="After accepting Tab or Ctrl+K, suggest the next nearby edit" checked={settings.aiNextEditPrediction} onChange={() => settings.toggle('aiNextEditPrediction')} />
                <ToggleRow visible={rowVisible('intelligence', 'breakpoint gutter')} label="Breakpoint gutter" description="Click the gutter to add breakpoints" checked={settings.breakpointGutter} onChange={() => settings.toggle('breakpointGutter')} />
              </SettingsSection>
            ) : null}

            {categoryVisible('files') ? (
              <SettingsSection title="Files & Save" description="Automatic saving and formatting">
                <SettingRow visible={rowVisible('files', 'auto save')} label="Auto save" description="Choose when modified files are written">
                  <Segmented
                    value={settings.autoSave}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'afterDelay', label: 'Delay' },
                      { value: 'onFocusChange', label: 'Focus' }
                    ]}
                    onChange={(value) => settings.set('autoSave', value)}
                  />
                </SettingRow>
                {settings.autoSave === 'afterDelay' ? (
                  <SettingRow visible={rowVisible('files', 'save delay')} label="Save delay" description="Wait after the last edit">
                    <RangeControl
                      min={250}
                      max={5000}
                      step={250}
                      value={settings.autoSaveDelayMs}
                      suffix="ms"
                      onChange={(value) => settings.set('autoSaveDelayMs', value)}
                    />
                  </SettingRow>
                ) : null}
                <ToggleRow visible={rowVisible('files', 'format on save')} label="Format on save" description="Run the configured formatter before writing" checked={settings.formatOnSave} onChange={() => settings.toggle('formatOnSave')} />
              </SettingsSection>
            ) : null}
          </div>
        </div>

        <div className="flex h-9 shrink-0 items-center justify-between border-t border-[var(--wb-border)] bg-[var(--wb-tabbar)] px-3">
          <span className="text-[9px] text-[var(--wb-muted)]">
            {Object.values(modifiedByCategory).reduce((sum, count) => sum + count, 0)} modified
          </span>
          <div className="flex items-center gap-1">
            {!normalizedQuery && modifiedByCategory[activeCategory] > 0 ? (
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
                onClick={() => settings.reset(CATEGORY_KEYS[activeCategory])}
              >
                <RotateCcw className="h-3 w-3" /> Reset section
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] text-[var(--wb-muted)] hover:bg-[var(--wb-hover)] hover:text-[var(--wb-fg)]"
              onClick={() => settings.resetAll()}
            >
              Reset all
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingsSection({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <Braces className="h-3.5 w-3.5 text-[var(--wb-accent)]" />
        <div>
          <h3 className="text-[11px] font-semibold">{title}</h3>
          <p className="text-[9px] text-[var(--wb-muted)]">{description}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-[var(--wb-border)] bg-[var(--wb-sidebar)]">
        {children}
      </div>
    </section>
  )
}

function SettingRow({
  label,
  description,
  children,
  visible = true
}: {
  label: string
  description?: string
  children: ReactNode
  visible?: boolean
}) {
  if (!visible) return null
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 border-b border-[var(--wb-border)] px-3 py-1.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-[var(--wb-fg)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[9px] leading-3 text-[var(--wb-muted)]">
            {description}
          </span>
        ) : null}
      </span>
      <div className="flex min-w-[190px] shrink-0 justify-end">{children}</div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  visible = true
}: {
  label: string
  description?: string
  checked: boolean
  onChange: () => void
  visible?: boolean
}) {
  return (
    <SettingRow label={label} description={description} visible={visible}>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </SettingRow>
  )
}

function RangeControl({
  min,
  max,
  step = 1,
  value,
  suffix = '',
  precision = 0,
  onChange
}: {
  min: number
  max: number
  step?: number
  value: number
  suffix?: string
  precision?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex w-48 items-center gap-2">
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="w-12 text-right text-[10px] tabular-nums text-[var(--wb-muted)]">
        {value.toFixed(precision)}
        {suffix}
      </span>
    </div>
  )
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex h-7 items-center rounded-md border border-[var(--wb-border)] bg-[var(--wb-editor)] p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={cn(
            'h-5 rounded px-2 text-[9px] text-[var(--wb-muted)]',
            value === option.value &&
              'bg-[var(--wb-active)] font-medium text-[var(--wb-fg)] shadow-sm'
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
