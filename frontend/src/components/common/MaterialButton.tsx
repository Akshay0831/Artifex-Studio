import React, { forwardRef, useState } from 'react'
import { SPACING_MULTIPLIERS, useThemeConfig } from '../../core/ThemeConfigContext'
import { cn } from '../../utils/cn'

export interface MaterialButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon'
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  startIcon?: React.ReactNode
  endIcon?: React.ReactNode
  ripple?: boolean
  density?: 'compact' | 'normal' | 'comfortable'
  children: React.ReactNode
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  title?: string
  className?: string
}

const variantStyles = {
  primary: 'bg-studio-primary hover:bg-studio-primary/90 text-white',
  secondary: 'bg-studio-secondary hover:bg-studio-secondary/90 text-white',
  outline: 'border-2 border-studio-accent text-studio-accent hover:bg-studio-accent/10',
  ghost: 'text-studio-text hover:bg-studio-hover',
  destructive: 'bg-studio-error hover:bg-studio-error/90 text-white'
}

const sizeStyles = {
  xs: 'text-xs rounded-md',
  sm: 'text-sm rounded-md',
  md: 'text-base rounded-lg',
  lg: 'text-lg rounded-lg',
  xl: 'text-xl rounded-xl',
  icon: 'rounded-md'
}

const buttonPadding = {
  compact: {
    xs: [0.5, 0.25],
    sm: [0.75, 0.375],
    md: [1, 0.5],
    lg: [1.25, 0.625],
    xl: [1.5, 0.75],
    icon: [0.5, 0.5],
  },
  normal: {
    xs: [0.75, 0.375],
    sm: [1, 0.5],
    md: [1.25, 0.625],
    lg: [1.75, 0.75],
    xl: [2.25, 1],
    icon: [0.5, 0.5],
  },
  comfortable: {
    xs: [1, 0.5],
    sm: [1.25, 0.625],
    md: [1.5, 0.75],
    lg: [2, 1],
    xl: [2.5, 1.25],
    icon: [0.625, 0.625],
  },
}

export const MaterialButton = forwardRef<HTMLButtonElement, MaterialButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  startIcon,
  endIcon,
  ripple = true,
  density: propDensity,
  title,
  children,
  onClick,
  className,
  ...props
}, ref) => {
  const { theme } = useThemeConfig()
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([])
  const density = propDensity || theme.density
  const baseStyles = 'font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'
  const variantClass = variantStyles[variant]
  const sizeClass = sizeStyles[size]
  const [horizontalPadding, verticalPadding] = buttonPadding[density][size]
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
  const fullClass = fullWidth ? 'w-full' : ''

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return
    
    if (ripple && event.currentTarget) {
      const button = event.currentTarget
      const rect = button.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      
      const newRipple = { x, y, id: Date.now() }
      setRipples(prev => [...prev, newRipple])
      
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== newRipple.id))
      }, 600)
    }
    
    onClick?.(event)
  }

  return (
    <button
      ref={ref}
      className={cn(
        baseStyles,
        variantClass,
        sizeClass,
        disabledClass,
        fullClass,
        'relative overflow-hidden',
        className
      )}
      onClick={handleClick}
      disabled={disabled || loading}
      title={title ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined)}
      style={{
        gap: `${0.5 * SPACING_MULTIPLIERS[theme.spacing]}rem`,
        padding: `${verticalPadding * SPACING_MULTIPLIERS[theme.spacing]}rem ${horizontalPadding * SPACING_MULTIPLIERS[theme.spacing]}rem`,
      }}
      {...props}
    >
      {/* Ripple effects */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute rounded-full bg-white/20 animate-ripple pointer-events-none"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: '20px',
            height: '20px',
          }}
        />
      ))}
      
      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      
      {/* Icon and content */}
      <div className="flex min-w-0 max-w-full items-center justify-center gap-2">
        {startIcon && !loading && (
          <span className="flex-shrink-0">{startIcon}</span>
        )}
        
        {loading ? (
          <div className="opacity-0">{children}</div>
        ) : (
          <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{children}</div>
        )}
        
        {endIcon && !loading && (
          <span className="flex-shrink-0">{endIcon}</span>
        )}
      </div>
    </button>
  )
})

MaterialButton.displayName = 'MaterialButton'