import React, { createContext, forwardRef, useContext, useState } from 'react'
import { cn } from '../../../lib/utils'

export interface ThemedTabsProps {
  children: React.ReactNode
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
}

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

export const ThemedTabs = forwardRef<HTMLDivElement, ThemedTabsProps>(
  ({ children, value, defaultValue = '', onValueChange, className, ...props }, ref) => {
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
    const selectedValue = value ?? uncontrolledValue
    const setValue = (nextValue: string) => {
      if (value === undefined) setUncontrolledValue(nextValue)
      onValueChange?.(nextValue)
    }

    return (
      <TabsContext.Provider value={{ value: selectedValue, setValue }}>
        <div ref={ref} className={cn('w-full', className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)

export interface ThemedTabsListProps {
  children: React.ReactNode
  className?: string
}

export const ThemedTabsList = forwardRef<HTMLDivElement, ThemedTabsListProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex h-10 items-center justify-center rounded-md bg-studio-panel p-1 text-studio-text',
          className
        )}
        role="tablist"
        {...props}
      >
        {children}
      </div>
    )
  }
)

export interface ThemedTabsTriggerProps {
  children: React.ReactNode
  value: string
  className?: string
}

export const ThemedTabsTrigger = forwardRef<HTMLButtonElement, ThemedTabsTriggerProps>(
  ({ children, value, className, ...props }, ref) => {
    const tabs = useContext(TabsContext)
    if (!tabs) throw new Error('TabsTrigger must be used within Tabs')
    const active = tabs.value === value
    
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={active}
        data-state={active ? 'active' : 'inactive'}
        onClick={() => tabs.setValue(value)}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-studio-accent focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-studio-panel-selected data-[state=active]:text-white',
          'data-[state=active]:shadow-md',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

export interface ThemedTabsContentProps {
  children: React.ReactNode
  value: string
  className?: string
}

export const ThemedTabsContent = forwardRef<HTMLDivElement, ThemedTabsContentProps>(
  ({ children, value, className, ...props }, ref) => {
    const tabs = useContext(TabsContext)
    if (!tabs) throw new Error('TabsContent must be used within Tabs')
    if (tabs.value !== value) return null
    
    return (
      <div
        ref={ref}
        role="tabpanel"
        className={cn(
          'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-accent focus-visible:ring-offset-2',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)