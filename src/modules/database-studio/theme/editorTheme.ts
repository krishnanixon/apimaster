import { useEffect, useState } from 'react'
import { tags as t } from '@lezer/highlight'
import { createTheme } from '@uiw/codemirror-themes'

function cssHsl(varName: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return 'transparent'
  return alpha != null ? `hsl(${raw} / ${alpha})` : `hsl(${raw})`
}

function resolveEditorMode(editorTheme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (editorTheme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return editorTheme
}

function buildTheme(mode: 'light' | 'dark') {
  const isDark = mode === 'dark'

  return createTheme({
    theme: mode,
    settings: {
      background: cssHsl('--background'),
      foreground: cssHsl('--foreground'),
      caret: cssHsl('--primary'),
      selection: cssHsl('--primary', isDark ? 0.28 : 0.18),
      selectionMatch: cssHsl('--primary', 0.12),
      lineHighlight: cssHsl('--accent', isDark ? 0.45 : 0.7),
      gutterBackground: cssHsl('--background'),
      gutterForeground: cssHsl('--muted-foreground'),
      gutterActiveForeground: cssHsl('--foreground'),
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
      { tag: [t.brace, t.squareBracket, t.paren], color: cssHsl('--muted-foreground') },
      { tag: [t.punctuation, t.separator], color: cssHsl('--muted-foreground') },
      { tag: t.operator, color: cssHsl('--foreground') },
      { tag: [t.className, t.typeName], color: isDark ? '#7ee787' : '#116329' },
      { tag: [t.variableName, t.attributeName], color: isDark ? '#ffa657' : '#953800' },
      { tag: t.invalid, color: cssHsl('--destructive') }
    ]
  })
}

/** CodeMirror theme synced with app background and design tokens. */
export function useDbEditorTheme(editorTheme: 'light' | 'dark' | 'system') {
  const [theme, setTheme] = useState(() => buildTheme(resolveEditorMode(editorTheme)))

  useEffect(() => {
    const refresh = () => setTheme(buildTheme(resolveEditorMode(editorTheme)))
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
  }, [editorTheme])

  return theme
}
