import { useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  Download,
  LayoutPanelLeft,
  Palette,
  Pipette,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Type,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Slider } from '@/shared/components/ui/slider'
import { SettingToggle } from '@/features/settings/components/SettingToggle'
import {
  SegmentedControl,
  SettingsGroup,
  SettingsRow
} from '@/features/settings/components/SettingsSection'
import { useSettingsStore, applyTheme } from '@/shared/stores/settings.store'
import {
  useUIStore,
  VISUAL_THEME_META,
  LAYOUT_STYLE_META,
  NAV_CHROME_STYLE_META,
  type VisualTheme,
  type LayoutStyle,
  type NavChromeStyle
} from '@/shared/stores/ui.store'
import {
  ACCENT_SWATCHES,
  FONT_STACKS,
  MOTION_RANGE,
  RADIUS_RANGE,
  UI_SCALE_RANGE,
  parseTheme,
  serializeTheme,
  type FontChoice,
  type ThemePreset
} from '@/shared/lib/theme-engine'
import { cn } from '@/shared/lib/utils'
import { PRODUCT_NAME } from '@shared/constants/product'
import type { ThemeMode } from '@shared/types'

/** A short list of calm palettes. Other styles only show up if one is already selected. */
const CURATED_THEMES: VisualTheme[] = ['default', 'minimal', 'professional', 'midnight']

/** Single representative color per style, used as a small dot instead of a gradient banner. */
const THEME_DOT: Record<VisualTheme, string> = {
  default: '#c96442',
  minimal: '#52525b',
  professional: '#3b5b8c',
  midnight: '#1e293b',
  modern: '#6366f1',
  glass: '#2dd4bf',
  ocean: '#2563eb',
  forest: '#059669',
  sunset: '#f97316',
  rose: '#ec4899'
}

const LAYOUT_STYLES = (
  Object.entries(LAYOUT_STYLE_META) as [LayoutStyle, (typeof LAYOUT_STYLE_META)[LayoutStyle]][]
).map(([value, meta]) => ({ value, label: meta.label }))

const NAV_CHROME_STYLES = (
  Object.entries(NAV_CHROME_STYLE_META) as [
    NavChromeStyle,
    (typeof NAV_CHROME_STYLE_META)[NavChromeStyle]
  ][]
).map(([value, meta]) => ({ value, label: meta.label }))

const FONT_CHOICES = (
  Object.entries(FONT_STACKS) as [FontChoice, (typeof FONT_STACKS)[FontChoice]][]
).map(([value, meta]) => ({ value, label: meta.label }))

const COLOR_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' }
]

export function ThemeStudio() {
  const { settings, updateSettings } = useSettingsStore()
  const {
    visualTheme,
    setVisualTheme,
    layoutStyle,
    setLayoutStyle,
    navChromeStyle,
    setNavChromeStyle,
    themeCustomization: custom,
    setThemeCustomization,
    resetThemeCustomization,
    themePresets,
    saveThemePreset,
    deleteThemePreset,
    applyThemePreset
  } = useUIStore()

  const [presetName, setPresetName] = useState('')
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleThemeChange = async (theme: ThemeMode) => {
    applyTheme(theme)
    await updateSettings({ theme })
  }

  const handleHexCommit = (raw: string) => {
    const value = raw.trim()
    if (!value) {
      setThemeCustomization({ accent: null })
      return
    }
    const hex = value.startsWith('#') ? value : `#${value}`
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
      toast.error('Enter a valid hex color, e.g. #c96442')
      return
    }
    setThemeCustomization({ accent: hex })
  }

  const handleSavePreset = () => {
    const preset = saveThemePreset(presetName)
    setPresetName('')
    toast.success(`Saved "${preset.name}"`)
  }

  const handleExport = () => {
    const json = serializeTheme({
      name: presetName.trim() || `${PRODUCT_NAME} theme`,
      visualTheme,
      layoutStyle,
      customization: custom
    })
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'apimaster-theme.json'
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Theme exported')
  }

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseTheme(await file.text())
    if (!parsed) {
      toast.error(`That file is not a ${PRODUCT_NAME} theme`)
      return
    }
    applyThemePreset({ id: 'imported', createdAt: Date.now(), ...parsed })
    toast.success(`Applied "${parsed.name}"`)
  }

  const handleApplyPreset = (preset: ThemePreset) => {
    applyThemePreset(preset)
    toast.success(`Applied "${preset.name}"`)
  }

  const isCustomized =
    custom.accent !== null ||
    custom.radius !== null ||
    custom.uiScale !== 1 ||
    custom.fontFamily !== 'inter' ||
    custom.tintSurfaces ||
    custom.surface !== 'solid' ||
    custom.contrast !== 'default' ||
    custom.reduceMotion ||
    custom.motionScale !== 1

  const styleOptions = CURATED_THEMES.includes(visualTheme)
    ? CURATED_THEMES
    : [...CURATED_THEMES, visualTheme]

  return (
    <div className="max-w-3xl space-y-6">
      <ThemePreview />

      <SettingsGroup
        title="Theme"
        description="Changes apply instantly across every window."
        icon={Palette}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetThemeCustomization()
              toast.success('Appearance reset to defaults')
            }}
            disabled={!isCustomized}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        }
        flush
      >
        <SettingsRow label="Color mode" description="System follows your OS light or dark setting.">
          <SegmentedControl
            ariaLabel="Color mode"
            value={settings?.theme ?? 'system'}
            options={COLOR_MODES}
            onChange={(value) => void handleThemeChange(value)}
          />
        </SettingsRow>

        <SettingsRow label="Style" description="The base palette for surfaces and text." stacked>
          <div
            role="radiogroup"
            aria-label="Style"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {styleOptions.map((value) => {
              const selected = visualTheme === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={VISUAL_THEME_META[value].description}
                  onClick={() => setVisualTheme(value)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/70 hover:bg-accent/40'
                  )}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: THEME_DOT[value] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {value === 'default' ? PRODUCT_NAME : VISUAL_THEME_META[value].label}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </SettingsRow>

        <SettingsRow
          label="Accent color"
          description="Used for buttons, focus rings, and selections."
          stacked
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={custom.accent === null}
              onClick={() => setThemeCustomization({ accent: null })}
              className={cn(
                'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                custom.accent === null
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/70 text-muted-foreground hover:bg-accent/60'
              )}
            >
              Default
            </button>
            {ACCENT_SWATCHES.map(({ name, hex }) => {
              const selected = custom.accent?.toLowerCase() === hex
              return (
                <button
                  key={hex}
                  type="button"
                  title={name}
                  aria-label={`${name} accent`}
                  aria-pressed={selected}
                  onClick={() => setThemeCustomization({ accent: hex })}
                  style={{ backgroundColor: hex }}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-black/10 transition-transform hover:scale-105',
                    selected && 'ring-2 ring-foreground/60 ring-offset-2 ring-offset-background'
                  )}
                >
                  {selected && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              )
            })}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <label
              className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:text-foreground"
              title="Custom color"
            >
              <Pipette className="h-3.5 w-3.5" />
              <input
                type="color"
                value={custom.accent ?? '#c96442'}
                onChange={(e) => setThemeCustomization({ accent: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Custom accent color"
              />
            </label>
            <Input
              value={hexDraft ?? custom.accent ?? ''}
              placeholder="#c96442"
              spellCheck={false}
              aria-label="Accent hex value"
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={(e) => {
                handleHexCommit(e.target.value)
                setHexDraft(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="h-7 w-24 font-mono text-xs"
            />
          </div>
        </SettingsRow>

        <SettingToggle
          label="Tint surfaces with accent"
          description="Blends a hint of the accent into the sidebar and panels."
          checked={custom.tintSurfaces}
          onChange={(tintSurfaces) => setThemeCustomization({ tintSurfaces })}
        />
      </SettingsGroup>

      <SettingsGroup title="Layout" icon={LayoutPanelLeft} flush>
        <SettingsRow label="Density" description={LAYOUT_STYLE_META[layoutStyle]?.description}>
          <SegmentedControl
            ariaLabel="Density"
            value={layoutStyle}
            options={LAYOUT_STYLES}
            onChange={setLayoutStyle}
          />
        </SettingsRow>
        <SettingsRow
          label="Navigation"
          description={NAV_CHROME_STYLE_META[navChromeStyle]?.description}
        >
          <SegmentedControl
            ariaLabel="Navigation"
            value={navChromeStyle}
            options={NAV_CHROME_STYLES}
            onChange={setNavChromeStyle}
          />
        </SettingsRow>
        <SliderRow
          label="Interface scale"
          value={custom.uiScale}
          display={`${Math.round(custom.uiScale * 100)}%`}
          min={UI_SCALE_RANGE.min}
          max={UI_SCALE_RANGE.max}
          step={UI_SCALE_RANGE.step}
          onChange={(uiScale) => setThemeCustomization({ uiScale })}
          onReset={custom.uiScale !== 1 ? () => setThemeCustomization({ uiScale: 1 }) : undefined}
        />
        <SliderRow
          label="Corner radius"
          value={custom.radius ?? currentRadiusRem()}
          display={custom.radius === null ? 'Auto' : `${Math.round(custom.radius * 16)}px`}
          min={RADIUS_RANGE.min}
          max={RADIUS_RANGE.max}
          step={RADIUS_RANGE.step}
          onChange={(radius) => setThemeCustomization({ radius })}
          onReset={
            custom.radius !== null ? () => setThemeCustomization({ radius: null }) : undefined
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Text & readability" icon={Type} flush>
        <SettingsRow label="Typeface" description={FONT_STACKS[custom.fontFamily]?.note}>
          <SegmentedControl
            ariaLabel="Typeface"
            value={custom.fontFamily}
            options={FONT_CHOICES}
            onChange={(fontFamily) => setThemeCustomization({ fontFamily })}
          />
        </SettingsRow>
        <SettingToggle
          label="Increase contrast"
          description="Stronger borders and darker secondary text."
          checked={custom.contrast === 'high'}
          onChange={(high) => setThemeCustomization({ contrast: high ? 'high' : 'default' })}
        />
      </SettingsGroup>

      <SettingsGroup title="Motion & effects" icon={Sparkles} flush>
        <SettingToggle
          label="Reduce motion"
          description="Turns off transitions and animations."
          checked={custom.reduceMotion}
          onChange={(reduceMotion) => setThemeCustomization({ reduceMotion })}
        />
        <SliderRow
          label="Animation speed"
          value={custom.motionScale}
          display={
            custom.motionScale === 0
              ? 'Off'
              : custom.motionScale < 0.9
                ? `Snappy · ${custom.motionScale.toFixed(2)}x`
                : custom.motionScale > 1.1
                  ? `Relaxed · ${custom.motionScale.toFixed(2)}x`
                  : `Default · ${custom.motionScale.toFixed(2)}x`
          }
          min={MOTION_RANGE.min}
          max={MOTION_RANGE.max}
          step={MOTION_RANGE.step}
          disabled={custom.reduceMotion}
          onChange={(motionScale) => setThemeCustomization({ motionScale })}
          onReset={
            custom.motionScale !== 1 ? () => setThemeCustomization({ motionScale: 1 }) : undefined
          }
        />
        <SettingToggle
          label="Translucent surfaces"
          description="Frosted header and sidebar. Solid surfaces are faster to render."
          checked={custom.surface === 'glass'}
          onChange={(glass) => setThemeCustomization({ surface: glass ? 'glass' : 'solid' })}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Saved themes"
        description="Save the current look, or move it between machines as a JSON file."
        icon={Bookmark}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Theme name"
            aria-label="Theme name"
            className="h-8 max-w-[14rem] text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSavePreset()
            }}
          />
          <Button size="sm" onClick={handleSavePreset}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void handleImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        {themePresets.length > 0 ? (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {themePresets.map((preset) => (
              <li key={preset.id} className="flex items-center gap-3 px-3 py-2">
                <span
                  className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{
                    backgroundColor: preset.customization.accent ?? 'hsl(var(--primary))'
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{preset.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {VISUAL_THEME_META[preset.visualTheme as VisualTheme]?.label ?? 'Custom'} ·{' '}
                    {LAYOUT_STYLE_META[preset.layoutStyle as LayoutStyle]?.label ?? 'Comfortable'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleApplyPreset(preset)}>
                  Apply
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${preset.name}`}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteThemePreset(preset.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No saved themes yet.</p>
        )}
      </SettingsGroup>
    </div>
  )
}

/** Reads the radius the app is currently rendering with, for the "Auto" slider position. */
function currentRadiusRem(): number {
  if (typeof window === 'undefined') return 0.5
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--radius').trim()
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0.5
}

/** Miniature of the app in the live theme — only the primary color adds hue. */
function ThemePreview() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-soft"
    >
      <div className="flex h-36">
        <div className="app-sidebar flex w-28 shrink-0 flex-col gap-1 p-2">
          <div className="mb-1 h-2 w-12 rounded-full bg-sidebar-foreground/25" />
          <div className="flex h-6 items-center gap-1.5 rounded-md bg-sidebar-primary px-2">
            <span className="h-2 w-2 rounded-sm bg-sidebar-primary-foreground/80" />
            <span className="h-1.5 w-10 rounded-full bg-sidebar-primary-foreground/70" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-6 items-center gap-1.5 rounded-md px-2">
              <span className="h-2 w-2 rounded-sm bg-sidebar-foreground/30" />
              <span className="h-1.5 w-10 rounded-full bg-sidebar-foreground/20" />
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="page-header flex items-center gap-2 px-3 py-2">
            <span className="h-2 w-16 rounded-full bg-foreground/60" />
            <span className="ml-auto rounded-md bg-primary px-2 py-1 text-[9px] font-medium text-primary-foreground">
              Action
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <div className="app-panel rounded-lg border border-border p-2.5">
              <div className="h-1.5 w-20 rounded-full bg-foreground/50" />
              <div className="mt-1.5 h-1.5 w-32 rounded-full bg-muted-foreground/35" />
              <div className="mt-1.5 h-1.5 w-24 rounded-full bg-muted-foreground/25" />
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-input bg-background px-2 py-1 text-[9px] text-muted-foreground">
                Search…
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-[9px] text-muted-foreground">
                Secondary
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  disabled,
  onChange,
  onReset
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
  onReset?: () => void
}) {
  return (
    <div className={cn('px-5 py-4', disabled && 'opacity-60')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs tabular-nums text-muted-foreground">{display}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Reset ${label}`}
              title="Reset"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
