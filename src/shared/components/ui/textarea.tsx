import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-soft transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'
