import { indentUnit } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { highlightSelectionMatches } from '@codemirror/search'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightTrailingWhitespace,
  highlightWhitespace
} from '@codemirror/view'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { showMinimap } from '@replit/codemirror-minimap'
import type { EditorSettings } from '../stores/editorSettings.store'
import { diagnosticsExtension } from './diagnostics-extension'
import { editorKeymap } from './editor-keymap'
import { gitChangeGutter } from './git-gutter'
import { ghostTextExtension } from './ghost-text'
import { inlineEditDecorations } from './inline-edit'
import { languageCompletions } from './language-completions'
import { breakpointGutter } from './breakpoint-gutter'
import { symbolHover } from './hover-intel'

function minimapExtension(): Extension {
  return showMinimap.compute([], () => ({
    create: () => {
      const dom = document.createElement('div')
      dom.style.background = 'transparent'
      return { dom }
    },
    displayText: 'blocks',
    showOverlay: 'mouse-over'
  }))
}

/** Sizing/typography that CodeMirror can't express through the color theme. */
function appearanceTheme(settings: EditorSettings): Extension {
  const cursor = {
    borderLeft:
      settings.cursorStyle === 'line' ? '2px solid var(--wb-accent)' : '0 solid transparent',
    borderBottom:
      settings.cursorStyle === 'underline' ? '2px solid var(--wb-accent)' : '0 solid transparent',
    width: settings.cursorStyle === 'line' ? '0' : '0.68em',
    backgroundColor:
      settings.cursorStyle === 'block'
        ? 'color-mix(in srgb, var(--wb-accent) 55%, transparent)'
        : 'transparent'
  }

  return EditorView.theme({
    '&': {
      fontSize: `${settings.fontSize}px`,
      height: '100%'
    },
    '.cm-scroller': {
      fontFamily: settings.fontFamily,
      lineHeight: String(settings.lineHeight),
      fontVariantLigatures: settings.fontLigatures ? 'contextual' : 'none',
      fontFeatureSettings: settings.fontLigatures ? "'liga' 1, 'calt' 1" : "'liga' 0, 'calt' 0",
      scrollBehavior: settings.smoothScrolling ? 'smooth' : 'auto'
    },
    '.cm-content': {
      paddingBottom: settings.scrollPastEnd ? '50vh' : '0'
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 10px', minWidth: '2.4ch' },
    '.cm-foldGutter .cm-gutterElement': { padding: '0 2px' },
    '.cm-highlightSpace:before': { color: 'rgba(127,127,127,0.4)' },
    '.cm-lint-marker': { width: '0.8em', height: '0.8em' },
    '.cm-cursor': {
      ...cursor,
      animation: settings.cursorBlink ? 'cm-blink 1.2s steps(1) infinite' : 'none'
    },
    '.cm-tooltip.cm-tooltip-lint': { fontSize: '12px', maxWidth: '480px' },
    '.cm-tooltip-hover': {
      backgroundColor: 'var(--wb-sidebar, hsl(var(--popover)))',
      color: 'var(--wb-fg, hsl(var(--popover-foreground)))',
      border: '1px solid var(--wb-border, hsl(var(--border)))',
      borderRadius: '6px',
      maxWidth: '360px'
    }
  })
}

export interface EditorExtensionOptions {
  settings: EditorSettings
  filePath: string
  /** Extra language/keymap extensions supplied by the caller. */
  extras?: Extension[]
}

/**
 * Builds the full extension set for an editor pane from the user's preferences.
 * Rebuilt whenever a relevant setting changes, so CodeMirror gets a fresh config.
 */
export function buildEditorExtensions({ settings, filePath, extras = [] }: EditorExtensionOptions): Extension[] {
  const extensions: Extension[] = [
    appearanceTheme(settings),
    EditorState.tabSize.of(settings.tabSize),
    indentUnit.of(settings.insertSpaces ? ' '.repeat(settings.tabSize) : '\t')
  ]

  if (settings.wordWrap !== 'off') extensions.push(EditorView.lineWrapping)
  if (settings.wordWrap === 'bounded') {
    extensions.push(
      EditorView.theme({
        '.cm-content': { maxWidth: `${settings.wordWrapColumn}ch` }
      })
    )
  }
  if (settings.highlightActiveLine) extensions.push(highlightActiveLine(), highlightActiveLineGutter())
  if (settings.highlightSelectionMatches) extensions.push(highlightSelectionMatches())
  if (settings.indentGuides) extensions.push(indentationMarkers({ hideFirstIndent: true, highlightActiveBlock: true }))
  if (settings.minimap) extensions.push(minimapExtension())
  if (settings.renderWhitespace === 'all') extensions.push(highlightWhitespace())
  if (settings.renderWhitespace !== 'none') extensions.push(highlightTrailingWhitespace())
  if (settings.showDiagnostics) extensions.push(diagnosticsExtension(filePath))
  if (settings.gitGutter) extensions.push(gitChangeGutter())
  if (settings.hoverDocumentation) extensions.push(symbolHover(filePath))
  extensions.push(languageCompletions(filePath))
  if (settings.breakpointGutter) extensions.push(breakpointGutter(filePath))
  extensions.push(inlineEditDecorations())
  if (settings.aiTabCompletions || settings.aiNextEditPrediction) {
    extensions.push(ghostTextExtension(filePath))
  }

  extensions.push(editorKeymap())
  extensions.push(...extras)
  return extensions
}

/** Options forwarded to `@uiw/react-codemirror`'s `basicSetup` prop. */
export function basicSetupOptions(settings: EditorSettings) {
  return {
    lineNumbers: settings.lineNumbers,
    foldGutter: settings.foldGutter,
    autocompletion: settings.autocomplete,
    closeBrackets: settings.closeBrackets,
    bracketMatching: settings.bracketMatching,
    highlightActiveLine: false,
    highlightActiveLineGutter: false,
    highlightSelectionMatches: false,
    searchKeymap: true,
    tabSize: settings.tabSize
  }
}
