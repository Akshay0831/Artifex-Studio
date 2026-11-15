import React, { createContext, forwardRef, useContext, useState } from 'react'
import { cn } from '../../../lib/utils'

export interface ThemedDialogProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

interface DialogContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

export const ThemedDialog = forwardRef<HTMLDivElement, ThemedDialogProps>(
  ({ children, open, onOpenChange, className, ...props }, ref) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
    const isOpen = open ?? uncontrolledOpen
    const setOpen = (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    }

    return (
      <DialogContext.Provider value={{ open: isOpen, setOpen }}>
        <div ref={ref} className={cn('contents', className)} {...props}>
          {children}
        </div>
      </DialogContext.Provider>
    )
  }
)

export interface ThemedDialogTriggerProps {
  children: React.ReactNode
  asChild?: boolean
  className?: string
}

export const ThemedDialogTrigger = forwardRef<HTMLButtonElement, ThemedDialogTriggerProps>(
  ({ children, asChild, className, ...props }, ref) => {
    const dialog = useContext(DialogContext)
    if (!dialog) throw new Error('DialogTrigger must be used within a Dialog')

    if (asChild && React.isValidElement<{ onClick?: React.MouseEventHandler; className?: string }>(children)) {
      const child = children
      return React.cloneElement(child, {
        onClick: event => {
          child.props.onClick?.(event)
          if (!event.defaultPrevented) dialog.setOpen(true)
        },
        className: cn(child.props.className, className),
      })
    }
    
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-studio-accent disabled:pointer-events-none disabled:opacity-50',
          'bg-studio-accent text-white hover:bg-studio-accent-hover',
          className
        )}
        onClick={() => dialog.setOpen(true)}
        {...props}
      >
        {children}
      </button>
    )
  }
)

export interface ThemedDialogContentProps {
  children: React.ReactNode
  className?: string
  onClose?: () => void
}

export const ThemedDialogContent = forwardRef<HTMLDivElement, ThemedDialogContentProps>(
  ({ children, className, onClose, ...props }, ref) => {
    const dialog = useContext(DialogContext)
    if (!dialog) throw new Error('DialogContent must be used within a Dialog')
    if (!dialog.open) return null
    
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="presentation"
        onClick={event => {
          if (event.target === event.currentTarget) {
            dialog.setOpen(false)
            onClose?.()
          }
        }}
      >
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            'relative max-h-[90vh] max-w-[calc(100vw-2rem)] transform overflow-y-auto rounded-lg bg-studio-card p-6 text-studio-text shadow-xl transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            className
          )}
          {...props}
        >
          {children}
        </div>
      </div>
    )
  }
)

export interface ThemedDialogHeaderProps {
  children: React.ReactNode
  className?: string
}

export const ThemedDialogHeader = forwardRef<HTMLDivElement, ThemedDialogHeaderProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col space-y-1.5 text-center sm:text-left',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

export interface ThemedDialogTitleProps {
  children: React.ReactNode
  className?: string
}

export const ThemedDialogTitle = forwardRef<HTMLDivElement, ThemedDialogTitleProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <h2
        ref={ref}
        className={cn(
          'text-lg font-semibold leading-none tracking-tight',
          className
        )}
        {...props}
      >
        {children}
      </h2>
    )
  }
)

export interface ThemedDialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

export const ThemedDialogDescription = forwardRef<HTMLParagraphElement, ThemedDialogDescriptionProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn(
          'text-sm text-studio-text-dim',
          className
        )}
        {...props}
      >
        {children}
      </p>
    )
  }
)