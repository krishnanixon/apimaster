import { useEffect, useRef, useCallback } from 'react'

export function useDebouncedSave<T>(
  value: T,
  onSave: (value: T) => void | Promise<void>,
  delay = 800,
  enabled = true
): { isSaving: boolean } {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)
  const savingRef = useRef(false)

  const save = useCallback(
    async (v: T) => {
      savingRef.current = true
      await onSave(v)
      savingRef.current = false
    },
    [onSave]
  )

  useEffect(() => {
    if (!enabled) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      void save(value)
    }, delay)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value, delay, enabled, save])

  return { isSaving: savingRef.current }
}
