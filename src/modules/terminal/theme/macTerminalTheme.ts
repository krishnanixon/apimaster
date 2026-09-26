import type { ITheme } from '@xterm/xterm'

/** ANSI colors tuned to stay readable on Diablo's dark workbench surface. */
export const terminalDarkTheme: ITheme = {
  background: '#0d0d0d',
  foreground: '#e8e8e8',
  cursor: '#e8e8e8',
  cursorAccent: '#0d0d0d',
  selectionBackground: 'rgba(255, 255, 255, 0.18)',
  selectionForeground: '#ffffff',
  black: '#0d0d0d',
  red: '#ff5f56',
  green: '#27c93f',
  yellow: '#ffbd2e',
  blue: '#57c7ff',
  magenta: '#ff6ac1',
  cyan: '#5af0ff',
  white: '#e8e8e8',
  brightBlack: '#5a5a5a',
  brightRed: '#ff7f7a',
  brightGreen: '#5af78e',
  brightYellow: '#f3f99d',
  brightBlue: '#57c7ff',
  brightMagenta: '#ff92d0',
  brightCyan: '#9aedfe',
  brightWhite: '#ffffff'
}

/** ANSI colors tuned for the light workbench without washing out command output. */
export const terminalLightTheme: ITheme = {
  background: '#fcfcfc',
  foreground: '#3b3b3b',
  cursor: '#0078d4',
  cursorAccent: '#fcfcfc',
  selectionBackground: 'rgba(0, 120, 212, 0.2)',
  selectionForeground: '#24292f',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#7d4e00',
  blue: '#0550ae',
  magenta: '#8250df',
  cyan: '#0969da',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#9a6700',
  brightBlue: '#0969da',
  brightMagenta: '#a475f9',
  brightCyan: '#1b7c83',
  brightWhite: '#24292f'
}

function cssToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback
}

/** Resolve live workbench tokens so xterm follows light/dark and visual theme changes. */
export function resolveTerminalTheme(root?: HTMLElement): ITheme {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return terminalDarkTheme
  }

  const target = root ?? document.documentElement
  const dark = target.classList.contains('dark')
  const palette = dark ? terminalDarkTheme : terminalLightTheme
  const styles = getComputedStyle(target)
  const background = cssToken(styles, '--wb-editor', palette.background ?? '#181818')
  const foreground = cssToken(styles, '--wb-fg', palette.foreground ?? '#cccccc')
  const accent = cssToken(styles, '--wb-accent', palette.cursor ?? foreground)

  return {
    ...palette,
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    selectionForeground: foreground
  }
}

/** Kept for compatibility with any consumers importing the original dark palette. */
export const macTerminalTheme = terminalDarkTheme
