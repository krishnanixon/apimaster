import { useEffect, useState } from 'react'
import type { Extension } from '@codemirror/state'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

/** Loads a CodeMirror language extension by matching a synthetic filename (e.g. "body.json"). */
export function useLanguageExtension(filename: string | null): Extension | null {
  const [extension, setExtension] = useState<Extension | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!filename) {
      setExtension(null)
      return
    }
    const description = LanguageDescription.matchFilename(languages, filename)
    if (!description) {
      setExtension(null)
      return
    }
    description
      .load()
      .then((support) => {
        if (!cancelled) setExtension(support)
      })
      .catch(() => {
        if (!cancelled) setExtension(null)
      })
    return () => {
      cancelled = true
    }
  }, [filename])

  return extension
}
