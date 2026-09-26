import { useEffect, useRef, useState } from 'react'
import type { PresentationSlide, SlideSize } from '@shared/types/presentation-document'
import { getSlideScale } from '@shared/lib/presentation-geometry'
import { SlideRenderer } from '../rendering/SlideRenderer'
import { cn } from '@/shared/lib/utils'

interface ScaledSlideFrameProps {
  slide: PresentationSlide
  logicalSize: SlideSize
  className?: string
}

export function ScaledSlideFrame({ slide, logicalSize, className }: ScaledSlideFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      setScale(getSlideScale({ width: container.clientWidth, height: container.clientHeight }, logicalSize))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [logicalSize.height, logicalSize.width])

  return (
    <div ref={containerRef} className={cn('overflow-hidden', className)}>
      {scale > 0 ? (
        <div
          className="origin-top-left"
          style={{
            width: logicalSize.width,
            height: logicalSize.height,
            transform: `scale(${scale})`
          }}
        >
          <SlideRenderer slide={slide} logicalSize={logicalSize} />
        </div>
      ) : null}
    </div>
  )
}
