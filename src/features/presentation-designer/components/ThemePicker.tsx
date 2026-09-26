import { useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import {
  PRESENTATION_FONT_OPTIONS,
  PRESENTATION_THEMES,
  getPresentationTheme
} from '@shared/lib/presentation-model'
import type { PresentationDensity, PresentationThemeColors } from '@shared/types/presentation'
import { usePresentationEditorStore } from '../stores/presentation-editor.store'
import { ColorField } from './ColorField'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'

const COLOR_FIELDS: Array<{ key: keyof PresentationThemeColors; label: string }> = [
  { key: 'background', label: 'Canvas' },
  { key: 'surface', label: 'Card' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentText', label: 'On accent' },
  { key: 'border', label: 'Border' }
]

export function ThemePicker() {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const themeId = usePresentationEditorStore((s) => s.themeId)
  const themeOverrides = usePresentationEditorStore((s) => s.themeOverrides)
  const setThemeId = usePresentationEditorStore((s) => s.setThemeId)
  const setThemeOverrides = usePresentationEditorStore((s) => s.setThemeOverrides)
  const clearThemeOverrides = usePresentationEditorStore((s) => s.clearThemeOverrides)
  const theme = getPresentationTheme(themeId, themeOverrides)

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3 shadow-sm">
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Theme presets
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {PRESENTATION_THEMES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setThemeId(preset.id)
                clearThemeOverrides()
              }}
              className={cn(
                'group rounded-lg border p-1 text-left transition-colors',
                themeId === preset.id && !Object.keys(themeOverrides.colors ?? {}).length
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-foreground/20'
              )}
            >
              <div
                className="flex h-7 overflow-hidden rounded-md"
                style={{ background: preset.colors.background }}
              >
                <div className="w-1/3" style={{ background: preset.colors.accent }} />
                <div className="flex-1" style={{ background: preset.colors.surface }} />
              </div>
              <div className="mt-1 truncate text-center text-[9px] font-medium" title={preset.description}>
                {preset.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((value) => !value)}
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-border/70 px-2 text-[11px] font-medium hover:bg-muted/50"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Customize theme
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')} />
      </button>

      {advancedOpen ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Colors
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={() => clearThemeOverrides()}
              >
                Reset
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {COLOR_FIELDS.map((field) => (
                <ColorField
                  key={field.key}
                  label={field.label}
                  value={theme.colors[field.key]}
                  onChange={(value) => setThemeOverrides({ colors: { [field.key]: value } })}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Typography
            </p>
            <label className="block space-y-1 text-[11px]">
              <span className="text-muted-foreground">Heading font</span>
              <select
                value={theme.fonts.heading}
                onChange={(e) => setThemeOverrides({ fonts: { heading: e.target.value } })}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
              >
                {PRESENTATION_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-[11px]">
              <span className="text-muted-foreground">Body font</span>
              <select
                value={theme.fonts.body}
                onChange={(e) => setThemeOverrides({ fonts: { body: e.target.value } })}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
              >
                {PRESENTATION_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-[11px]">
              <span className="text-muted-foreground">Density</span>
              <select
                value={theme.density}
                onChange={(e) =>
                  setThemeOverrides({ density: e.target.value as PresentationDensity })
                }
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  )
}
