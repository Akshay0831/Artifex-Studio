import React, { forwardRef } from 'react'
import { cn } from '../../../lib/utils'

export interface ThemedLabelProps {
  children: React.ReactNode
  className?: string
  required?: boolean
  htmlFor?: string
}

export const ThemedLabel = forwardRef<HTMLLabelElement, ThemedLabelProps>(
  ({ children, className, required = false, ...props }, ref) => {
    
    return (
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          'text-studio-text',
          required && 'after:content-[ "*"] after:ml-1 after:text-red-500',
          className
        )}
        {...props}
      >
        {children}
      </label>
    )
  }
)