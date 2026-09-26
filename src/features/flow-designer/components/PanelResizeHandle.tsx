import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/utils'

interface PanelResizeHandleProps {
  side: 'left' | 'right'
  onResize: (delta: number) => void
  className?: string
}

export function PanelResizeHandle({ side, onResize, className }: PanelResizeHandleProps) {
  const dragging = useRef(false)
  const startX = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      startX.current = e.clientX
      onResize(side === 'left' ? delta : -delta)
    }
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onResize, side])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className={cn(
        'absolute top-0 z-10 h-full w-1.5 shrink-0 cursor-col-resize transition-colors hover:bg-primary/20',
        side === 'left' ? 'right-0' : 'left-0',
        className
      )}
    />
  )
}
