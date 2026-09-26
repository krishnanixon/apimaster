import { useEffect, useState } from 'react'
import { tags as t } from '@lezer/highlight'
import { createTheme } from '@uiw/codemirror-themes'
import { useSettingsStore } from '@/shared/stores/settings.store'

const FALLBACKS = {
  light: {
    muted: '#f6f8fa',
    foreground: '#1f2328',
    mutedForeground: '#656d76',
    primary: '#0969da',
    accent: '#eaeef2',
    destructive: '#cf222e'
  },
  dark: {
    muted: '#161b22',
    foreground: '#e6edf3',
    mutedForeground: '#8b949e',
    primary: '#2f81f7',
    accent: '#21262d',
    destructive: '#f85149'
  }
} as const

function cssHsl(
  varName: string,
  fallback: string,
  alpha?: number
): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) {
    if (alpha == null) return fallback
    // Approximate alpha on hex fallbacks via rgba when needed is overkill; solid fallback is fine.
    return fallback
  }
  return alpha != null ? `hsl(${raw} / ${alpha})` : `hsl(${raw})`
}

function buildTheme(mode: 'light' | 'dark') {
  const isDark = mode === 'dark'
  const fb = isDark ? FALLBACKS.dark : FALLBACKS.light

  return createTheme({
    theme: mode,
    settings: {
      background: cssHsl('--muted', fb.muted),
      foreground: cssHsl('--foreground', fb.foreground),
      caret: cssHsl('--primary', fb.primary),
      selection: cssHsl('--primary', fb.primary, isDark ? 0.28 : 0.18),
      selectionMatch: cssHsl('--primary', fb.primary, 0.12),
      lineHighlight: cssHsl('--accent', fb.accent, isDark ? 0.45 : 0.7),
      gutterBackground: cssHsl('--muted', fb.muted),
      gutterForeground: cssHsl('--muted-foreground', fb.mutedForeground),
      gutterActiveForeground: cssHsl('--foreground', fb.foreground),
      gutterBorder: 'transparent',
      fontFamily:
        "ui-monospace, 'JetBrains Mono', 'Fira Code', SFMono-Regular, Menlo, Consolas, monospace"
    },
    styles: [
      { tag: t.comment, color: isDark ? '#8b949e' : '#6e7781', fontStyle: 'italic' },
      { tag: t.propertyName, color: isDark ? '#79c0ff' : '#0550ae' },
      { tag: t.string, color: isDark ? '#a5d6ff' : '#0a3069' },
      { tag: t.number, color: isDark ? '#79c0ff' : '#0550ae' },
      { tag: [t.bool, t.null, t.keyword], color: isDark ? '#ff7b72' : '#cf222e' },
      { tag: [t.brace, t.squareBracket, t.paren], color: cssHsl('--muted-foreground', fb.mutedForeground) },
      { tag: [t.punctuation, t.separator], color: cssHsl('--muted-foreground', fb.mutedForeground) },
      { tag: t.operator, color: cssHsl('--foreground', fb.foreground) },
      { tag: [t.className, t.typeName], color: isDark ? '#7ee787' : '#116329' },
      { tag: [t.variableName, t.attributeName], color: isDark ? '#ffa657' : '#953800' },
      { tag: t.invalid, color: cssHsl('--destructive', fb.destructive) }
    ]
  })
}

/** CodeMirror theme synced with the live DOM dark class (source of truth for CSS vars). */
export function useApiStudioEditorTheme() {
  const getEffectiveTheme = useSettingsStore((s) => s.getEffectiveTheme)
  const [theme, setTheme] = useState(() =>
    buildTheme(document.documentElement.classList.contains('dark') ? 'dark' : getEffectiveTheme())
  )

  useEffect(() => {
    const resolveMode = (): 'light' | 'dark' =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'

    const refresh = () => setTheme(buildTheme(resolveMode()))
    refresh()

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', refresh)

    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-visual-theme', 'data-layout-style']
    })

    return () => {
      mq.removeEventListener('change', refresh)
      observer.disconnect()
    }
  }, [getEffectiveTheme])

  return theme
}
