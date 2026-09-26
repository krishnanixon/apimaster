import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/shared/lib/utils'

interface ToolbarPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
  align?: 'left' | 'right'
}

export function ToolbarPopover({
  open,
  onOpenChange,
  trigger,
  children,
  className,
  align = 'left'
}: ToolbarPopoverProps) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const popoverWidth = popoverRef.current?.offsetWidth ?? 176
    let left = align === 'right' ? rect.right - popoverWidth : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8))
    setPosition({ top: rect.bottom + 4, left })
  }, [align])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const id = requestAnimationFrame(() => updatePosition())
    return () => cancelAnimationFrame(id)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onScroll = () => updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onOpenChange])

  return (
    <>
      <div ref={triggerRef} className="inline-flex shrink-0">
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={cn(
              'fixed z-[200] rounded-lg border border-border bg-card p-2 shadow-xl',
              className
            )}
            style={{ top: position.top, left: position.left }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
