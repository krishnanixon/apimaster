import { tags as t } from '@lezer/highlight'
import { createTheme } from '@uiw/codemirror-themes'

/** Low-fatigue editor themes matching the compact Apple/Codex workbench. */

export const cursorDark = createTheme({
  theme: 'dark',
  settings: {
    background: '#1f1f1e',
    foreground: '#e8e8e5',
    caret: '#55c6a9',
    selection: '#2b6658b8',
    selectionMatch: '#2b665866',
    lineHighlight: '#252524',
    gutterBackground: '#1f1f1e',
    gutterForeground: '#696963',
    gutterActiveForeground: '#c9c9c5',
    gutterBorder: 'transparent',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  },
  styles: [
    { tag: t.comment, color: '#7d8974', fontStyle: 'italic' },
    { tag: [t.lineComment, t.blockComment, t.docComment], color: '#7d8974', fontStyle: 'italic' },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: '#b99ce8' },
    { tag: [t.operatorKeyword, t.definitionKeyword], color: '#b99ce8' },
    { tag: t.string, color: '#d6b281' },
    { tag: [t.regexp, t.special(t.string)], color: '#d16969' },
    { tag: t.number, color: '#b5cea8' },
    { tag: [t.bool, t.null], color: '#569cd6' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#79c8b2' },
    { tag: t.definition(t.function(t.variableName)), color: '#79c8b2' },
    { tag: [t.className, t.typeName, t.namespace], color: '#86b9df' },
    { tag: [t.variableName, t.propertyName], color: '#d6d6d2' },
    { tag: t.definition(t.variableName), color: '#d6d6d2' },
    { tag: t.definition(t.propertyName), color: '#d6d6d2' },
    { tag: t.self, color: '#569cd6' },
    { tag: [t.tagName], color: '#569cd6' },
    { tag: [t.attributeName], color: '#9cdcfe' },
    { tag: [t.angleBracket, t.squareBracket, t.paren, t.brace], color: '#d4d4d4' },
    { tag: [t.punctuation, t.separator], color: '#d4d4d4' },
    { tag: t.operator, color: '#d4d4d4' },
    { tag: [t.meta, t.annotation], color: '#c586c0' },
    { tag: t.invalid, color: '#f44747' },
    { tag: t.link, color: '#569cd6', textDecoration: 'underline' },
    { tag: t.heading, color: '#569cd6', fontWeight: 'bold' }
  ]
})

export const cursorLight = createTheme({
  theme: 'light',
  settings: {
    background: '#fdfdfc',
    foreground: '#292927',
    caret: '#0b8f70',
    selection: '#b9e6dacc',
    selectionMatch: '#b9e6da88',
    lineHighlight: '#f5f5f2',
    gutterBackground: '#fdfdfc',
    gutterForeground: '#aaa9a2',
    gutterActiveForeground: '#383835',
    gutterBorder: 'transparent',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  },
  styles: [
    { tag: t.comment, color: '#6a737d', fontStyle: 'italic' },
    { tag: [t.lineComment, t.blockComment, t.docComment], color: '#6a737d', fontStyle: 'italic' },
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: '#0550ae' },
    { tag: [t.operatorKeyword, t.definitionKeyword], color: '#0550ae' },
    { tag: t.string, color: '#0a3069' },
    { tag: [t.regexp, t.special(t.string)], color: '#116329' },
    { tag: t.number, color: '#0550ae' },
    { tag: [t.bool, t.null], color: '#0550ae' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8250df' },
    { tag: t.definition(t.function(t.variableName)), color: '#8250df' },
    { tag: [t.className, t.typeName, t.namespace], color: '#953800' },
    { tag: [t.variableName, t.propertyName], color: '#24292f' },
    { tag: t.definition(t.variableName), color: '#24292f' },
    { tag: t.definition(t.propertyName), color: '#24292f' },
    { tag: t.self, color: '#0550ae' },
    { tag: [t.tagName], color: '#116329' },
    { tag: [t.attributeName], color: '#0550ae' },
    { tag: [t.angleBracket, t.squareBracket, t.paren, t.brace], color: '#3b3b3b' },
    { tag: [t.punctuation, t.separator], color: '#3b3b3b' },
    { tag: t.operator, color: '#3b3b3b' },
    { tag: [t.meta, t.annotation], color: '#8250df' },
    { tag: t.invalid, color: '#cf222e' },
    { tag: t.link, color: '#0550ae', textDecoration: 'underline' },
    { tag: t.heading, color: '#0550ae', fontWeight: 'bold' }
  ]
})
