import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

// Theme configuration types
export interface MaterialTheme {
  density: 'compact' | 'normal' | 'comfortable'
  spacing: 'tight' | 'normal' | 'comfortable' | 'spacious' | 'extra-spacious'
  accentColor: 'primary' | 'secondary' | 'accent' | 'success' | 'error' | 'warning'
  borderRadius: 'minimal' | 'normal' | 'rounded' | 'extra-rounded'
  animations: 'none' | 'minimal' | 'standard' | 'enhanced'
}

interface ThemeConfigContextType {
  theme: MaterialTheme
  setTheme: (theme: Partial<MaterialTheme>) => void
  globalSpacingScale: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
    xl2: string
    xl3: string
  }
}

// Default theme configuration
const DEFAULT_THEME: MaterialTheme = {
  density: 'normal',
  spacing: 'normal',
  accentColor: 'primary',
  borderRadius: 'normal',
  animations: 'standard'
}

export const SPACING_MULTIPLIERS: Record<MaterialTheme['spacing'], number> = {
  tight: 0.875,
  normal: 1,
  comfortable: 1.125,
  spacious: 1.25,
  'extra-spacious': 1.375,
}

const ThemeConfigContext = createContext<ThemeConfigContextType | undefined>(undefined)

function isOption<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.some(option => option === value)
}

function pickOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return isOption(value, options) ? value : fallback
}

function loadSavedTheme(): MaterialTheme {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('material-theme') || 'null')
    if (typeof saved !== 'object' || saved === null) return DEFAULT_THEME
    const values = saved as Record<string, unknown>
    return {
      density: pickOption(values.density, ['compact', 'normal', 'comfortable'], DEFAULT_THEME.density),
      spacing: pickOption(values.spacing, ['tight', 'normal', 'comfortable', 'spacious', 'extra-spacious'], DEFAULT_THEME.spacing),
      accentColor: pickOption(values.accentColor, ['primary', 'secondary', 'accent', 'success', 'error', 'warning'], DEFAULT_THEME.accentColor),
      borderRadius: pickOption(values.borderRadius, ['minimal', 'normal', 'rounded', 'extra-rounded'], DEFAULT_THEME.borderRadius),
      animations: pickOption(values.animations, ['none', 'minimal', 'standard', 'enhanced'], DEFAULT_THEME.animations),
    }
  } catch {
    return DEFAULT_THEME
  }
}

// Material Design spacing scales based on user preference
const SPACING_SCALES = {
  tight: {
    xs: '0.125rem',
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    xl2: '1.25rem',
    xl3: '1.5rem'
  },
  normal: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xl2: '2.5rem',
    xl3: '3rem'
  },
  comfortable: {
    xs: '0.5rem',
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
    xl: '3rem',
    xl2: '4rem',
    xl3: '5rem'
  },
  spacious: {
    xs: '0.75rem',
    sm: '1.5rem',
    md: '2rem',
    lg: '3rem',
    xl: '4rem',
    xl2: '6rem',
    xl3: '8rem'
  },
  'extra-spacious': {
    xs: '1rem',
    sm: '2rem',
    md: '3rem',
    lg: '4rem',
    xl: '6rem',
    xl2: '8rem',
    xl3: '12rem'
  }
}

// Corner radius mappings
const BORDER_RADIUS = {
  minimal: {
    xs: '2px',
    sm: '4px',
    md: '4px',
    lg: '4px',
    xl: '6px',
    '2xl': '8px',
    '3xl': '10px',
  },
  normal: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    '3xl': '24px',
  },
  rounded: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '28px',
  },
  'extra-rounded': {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '20px',
    xl: '24px',
    '2xl': '28px',
    '3xl': '32px',
  }
}

const ACCENT_VARIABLES: Record<MaterialTheme['accentColor'], string> = {
  primary: '--studio-primary',
  secondary: '--studio-secondary',
  accent: '--studio-accent-default',
  success: '--studio-success',
  error: '--studio-error',
  warning: '--studio-warning',
}

export function ThemeConfigProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<MaterialTheme>(loadSavedTheme)

  const globalSpacingScale = useMemo(() => SPACING_SCALES[theme.spacing], [theme.spacing])

  useEffect(() => {
    const root = document.documentElement
    Object.entries(SPACING_SCALES[theme.spacing]).forEach(([key, value]) => {
      root.style.setProperty(`--spacing-${key}`, value)
    })
    Object.entries(BORDER_RADIUS[theme.borderRadius]).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value)
    })

    root.style.setProperty('--studio-spacing-scale', String(SPACING_MULTIPLIERS[theme.spacing]))
    root.style.setProperty('--studio-accent', `var(${ACCENT_VARIABLES[theme.accentColor]})`)
    root.dataset.spacing = theme.spacing
    root.dataset.borderRadius = theme.borderRadius
    root.dataset.animations = theme.animations

    const densityScale = {
      compact: 0.8,
      normal: 1,
      comfortable: 1.2
    }
    root.style.setProperty('--density-scale', densityScale[theme.density].toString())

    try {
      localStorage.setItem('material-theme', JSON.stringify(theme))
    } catch {
      // Appearance changes still apply for this session when storage is unavailable.
    }
  }, [theme])

  const setThemeProperty = (updates: Partial<MaterialTheme>) => {
    setTheme(prev => ({ ...prev, ...updates }))
  }

  return (
    <ThemeConfigContext.Provider value={{ 
      theme, 
      setTheme: setThemeProperty,
      globalSpacingScale
    }}>
      {children}
    </ThemeConfigContext.Provider>
  )
}

export function useThemeConfig() {
  const context = useContext(ThemeConfigContext)
  if (!context) {
    throw new Error('useThemeConfig must be used within a ThemeConfigProvider')
  }
  return context
}

// Custom hooks for specific theme properties
export function useSpacing() {
  const { globalSpacingScale } = useThemeConfig()
  return globalSpacingScale
}

export function useDensity() {
  const { theme } = useThemeConfig()
  return {
    scale: {
      compact: 0.8,
      normal: 1,
      comfortable: 1.2
    }[theme.density],
    className: `density-${theme.density}`
  }
}

export function useAnimations() {
  const { theme } = useThemeConfig()
  const animationClasses = {
    none: '',
    minimal: 'animate-fade-in',
    standard: 'animate-material-in',
    enhanced: 'animate-material-in animate-ripple'
  }
  return animationClasses[theme.animations]
}