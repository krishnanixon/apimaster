import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  min: number
  max: number
  step?: number
  value: number
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className, min, max, step = 1, value, style, ...props }, ref) => {
    const progress = max === min ? 0 : ((value - min) / (max - min)) * 100
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className={cn('ui-range', className)}
        style={{ ...style, ['--range-progress' as string]: `${progress}%` }}
        {...props}
      />
    )
  }
)
Slider.displayName = 'Slider'
