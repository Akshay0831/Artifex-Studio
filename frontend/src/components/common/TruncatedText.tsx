import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface TruncatedTextProps extends HTMLAttributes<HTMLSpanElement> {
  text: string
}

export function TruncatedText({ text, className, title, ...props }: TruncatedTextProps) {
  return (
    <span
      {...props}
      className={cn('adaptive-label-host block min-w-0 flex-1', className)}
      title={title ?? text}
      aria-label={props['aria-label'] ?? text}
    >
      <span className="adaptive-label-text block min-w-0 whitespace-normal break-words">
        {text}
      </span>
    </span>
  )
}
